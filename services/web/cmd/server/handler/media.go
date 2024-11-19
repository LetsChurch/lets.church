package handler

import (
	"encoding/json"
	"net/http"
	"strconv"

	"github.com/jackc/pgx/v5/pgtype"
	"github.com/labstack/echo/v4"
	"github.com/samber/lo"
	"github.com/samber/oops"
	"lets.church/cmd/server/components"
	"lets.church/cmd/server/pages"
	"lets.church/internal/data"
	"lets.church/internal/util"
	gutil "lets.church/internal/util"

	"github.com/asticode/go-astisub"
	"github.com/cespare/xxhash/v2"
)

type Range struct {
	Start float64 `json:"start"`
	End   float64 `json:"end"`
}

type MediaRecordRequest struct {
	ViewId string  `json:"viewId"`
	Ranges []Range `json:"ranges"`
}

type MediaRecordResponse struct {
	ViewId string `json:"viewId"`
}

func ratingUiState(userRating data.Rating, safeSubmittedRating *data.Rating, likes *int64, dislikes *int64) {
	if userRating == data.RatingLIKE {
		if *safeSubmittedRating == data.RatingLIKE {
			*likes -= 1
			*safeSubmittedRating = ""
		} else if *safeSubmittedRating == data.RatingDISLIKE {
			*likes -= 1
			*dislikes += 1
			*safeSubmittedRating = data.RatingDISLIKE
		}
	} else if userRating == data.RatingDISLIKE {
		if *safeSubmittedRating == data.RatingDISLIKE {
			*dislikes -= 1
			*safeSubmittedRating = ""
		} else if *safeSubmittedRating == data.RatingLIKE {
			*likes += 1
			*dislikes -= 1
			*safeSubmittedRating = data.RatingLIKE
		}
	} else {
		if *safeSubmittedRating == data.RatingLIKE {
			*likes += 1
		} else if *safeSubmittedRating == data.RatingDISLIKE {
			*dislikes += 1
		}
	}
}

func (h *Handler) MediaRoutes(app *echo.Echo) {
	g := app.Group("/media")

	g.GET("/:id", func(c echo.Context) error {
		eb := oops.In("handler::Media")
		ac, err := h.getAppContext(c)
		if err != nil {
			return eb.Hint("Could not get app context").Wrap(err)
		}

		id, err := gutil.ParseUuid(c.Param("id"))
		if err != nil {
			return eb.Errorf("missing id")
		}

		if id.Zero() {
			return eb.Errorf("missing id")
		}

		userId := pgtype.UUID{}

		if ac.Authenticated {
			userId = ac.User.ID
		}

		uploadRecord, err := h.Queries.UploadData(c.Request().Context(), data.UploadDataParams{UploadID: id.Pg(), UserID: userId})
		if err != nil {
			return eb.Hint("Could not fetch upload data").Wrap(err)
		}

		transcriptUrl := util.GetPublicMediaUrl(id.Canonical() + "/transcript.vtt")
		transcriptBytes, err := util.DownloadFileToReader(transcriptUrl)
		if err != nil {
			return eb.Hint("Could not fetch transcript").Wrap(err)
		}

		transcript, err := astisub.ReadFromWebVTT(transcriptBytes)
		if err != nil {
			return eb.Hint("Could not parse transcript").Wrap(err)
		}

		comments, err := h.Queries.GetUploadUserComments(c.Request().Context(), id.Pg())
		if err != nil {
			return eb.Hint("Could not fetch comments").Wrap(err)
		}

		groupedComments := lo.GroupBy(comments, func(comment data.GetUploadUserCommentsRow) string {
			if comment.ReplyingToID.Valid {
				return util.Uuid(comment.ReplyingToID.Bytes).Base58()
			}

			return ""
		})

		c.Response().WriteHeader(http.StatusOK)

		return pages.Media{
			Ac:            ac,
			Rc:            c.Request().Context(),
			UploadId:      id,
			UploadDataRow: &uploadRecord,
			Comments:      groupedComments,
			CommentsCount: len(comments),
			Transcript:    transcript,
		}.Render(c.Response())
	})

	g.POST("/:id/rate", func(ctx echo.Context) error {
		eb := oops.In("/media/:id/rate")
		ac, err := h.getAppContext(ctx)

		if err != nil {
			return eb.Hint("Error getting app context").Wrap(err)
		}

		// TODO: restrict rating private uploads
		if !ac.Authenticated {
			return eb.Hint("Not authenticated").Public("You must be logged in to rate media.").Errorf("Not authenticated")
		}

		submittedRating := ctx.FormValue("rating")
		likes, likesErr := strconv.ParseInt(ctx.FormValue("likes"), 10, 64)
		dislikes, dislikesErr := strconv.ParseInt(ctx.FormValue("dislikes"), 10, 64)

		if likesErr != nil || dislikesErr != nil {
			return eb.Hint("Invalid state").Errorf("Invalid state")
		}

		id, err := util.ParseUuid(ctx.Param("id"))

		if err != nil {
			return eb.Hint("Invalid ID").Public("Could not find upload").Wrap(err)
		}

		if submittedRating != "LIKE" && submittedRating != "DISLIKE" {
			return eb.Public("Invalid rating. Must be LIKE or DISLIKE.").Errorf("Invalid rating. Must be LIKE or DISLIKE.")
		}

		safeSubmittedRating := data.Rating(submittedRating)

		tx, err := h.PgxConn.Begin(ctx.Request().Context())
		if err != nil {
			return eb.Hint("Could not start transaction").Wrap(err)
		}
		defer tx.Rollback(ctx.Request().Context())
		txQueries := h.Queries.WithTx(tx)

		// 1. Get existing rating
		userRating, _ := txQueries.GetUploadUserRating(ctx.Request().Context(), data.GetUploadUserRatingParams{
			UploadID: id.Pg(),
			UserID:   ac.User.ID,
		})

		// 2. Delete any existing rating
		if err := txQueries.DeleteUploadUserRating(
			ctx.Request().Context(),
			data.DeleteUploadUserRatingParams{UploadID: id.Pg(), UserID: ac.User.ID},
		); err != nil {
			return eb.Hint("Could not delete existing rating").Wrap(err)
		}

		// 3. If the new rating is different from any existing rating, record it
		if userRating != safeSubmittedRating {
			if err := txQueries.RecordUploadUserRating(
				ctx.Request().Context(),
				data.RecordUploadUserRatingParams{UploadID: id.Pg(), UserID: ac.User.ID, Rating: safeSubmittedRating},
			); err != nil {
				return eb.Hint("Could not record new rating").Public("Error saving rating").Wrap(err)
			}
		}

		// 4. Commit transaction!
		if err = tx.Commit(ctx.Request().Context()); err != nil {
			return eb.Hint("Could not commit transaction").Wrap(err)
		}

		// 5. UI state
		ratingUiState(userRating, &safeSubmittedRating, &likes, &dislikes)

		// Submit partial response for HTMX
		if ctx.Request().Header.Get("HX-Request") == "true" {
			return pages.MediaRatingForm{
				UploadId:   id,
				Likes:      likes,
				Dislikes:   dislikes,
				UserRating: safeSubmittedRating,
			}.Render(ctx.Response())
		}

		// Redirect to media page
		return eb.Wrap(ctx.Redirect(http.StatusFound, "/media/"+id.Base58()))
	})

	g.GET("/:id/comment", func(ctx echo.Context) error {

		eb := oops.Hint("GET /:id/comment")
		ac, err := h.getAppContext(ctx)
		if err != nil {
			return eb.Wrap(err)
		}

		id, err := util.ParseUuid(ctx.Param("id"))
		if err != nil {
			return eb.Wrap(err)
		}

		replyingTo, err := util.ParseUuid(ctx.QueryParam("replyingTo"))
		if err != nil {
			return eb.Wrap(err)
		}

		likes, likesErr := strconv.ParseInt(ctx.QueryParam("likes"), 10, 64)
		dislikes, dislikesErr := strconv.ParseInt(ctx.QueryParam("dislikes"), 10, 64)

		if likesErr != nil || dislikesErr != nil {
			return eb.Hint("Invalid state").Errorf("Invalid state")
		}

		return eb.Wrap(components.CommentActions{
			Ac:        ac,
			UploadId:  id,
			ReplyOpen: true,
			CommentId: replyingTo,
			Likes:     likes,
			Dislikes:  dislikes,
		}.Render(ctx.Response()))
	})

	g.POST("/:id/comment", func(ctx echo.Context) error {
		eb := oops.In("POST /media/:id/comment")
		id, err := util.ParseUuid(ctx.Param("id"))
		ac, err := h.getAppContext(ctx)

		if err != nil {
			return eb.Hint("Error getting app context").Wrap(err)
		}

		// TODO: restrict commenting on private uploads
		if !ac.Authenticated {
			return eb.Hint("Not authenticated").Public("You must be logged in to post comments.").Errorf("Not authenticated")
		}

		commentText := ctx.FormValue("comment")

		if commentText == "" {
			return eb.Public("Comment cannot be empty").Errorf("Comment cannot be empty")
		}

		replyingTo := ctx.FormValue("replyingTo")

		_, err = h.Queries.CreateUploadUserComment(
			ctx.Request().Context(),
			data.CreateUploadUserCommentParams{
				UploadID: id.Pg(),
				AuthorID: ac.User.ID,
				Text:     commentText,
				ReplyingToID: lo.TernaryF(
					replyingTo != "",
					func() pgtype.UUID {
						id, _ := util.ParseUuid(replyingTo)
						return id.Pg()
					},
					func() pgtype.UUID {
						return pgtype.UUID{}
					},
				),
			},
		)

		if err != nil {
			return eb.Hint("Could not create comment").Wrap(err)
		}

		// Redirect to media page
		return eb.Wrap(ctx.Redirect(http.StatusFound, "/media/"+id.Base58()))
	})

	g.POST("/:id/comment/:commentId/rate", func(ctx echo.Context) error {
		eb := oops.In("POST /media/:id/comment")
		ac, err := h.getAppContext(ctx)

		if err != nil {
			return eb.Hint("Error getting app context").Wrap(err)
		}

		// TODO: restrict rating on private uploads
		if !ac.Authenticated {
			return eb.Hint("Not authenticated").Public("You must be logged in to rate comments.").Errorf("Not authenticated")
		}

		submittedRating := ctx.FormValue("rating")
		likes, likesErr := strconv.ParseInt(ctx.FormValue("likes"), 10, 64)
		dislikes, dislikesErr := strconv.ParseInt(ctx.FormValue("dislikes"), 10, 64)

		if likesErr != nil || dislikesErr != nil {
			return eb.Hint("Invalid state").Errorf("Invalid state")
		}

		id, err := util.ParseUuid(ctx.Param("id"))

		if err != nil {
			return eb.Hint("Invalid ID").Public("Could not find upload").Wrap(err)
		}

		commentId, err := util.ParseUuid(ctx.Param("commentId"))

		if err != nil {
			return eb.Hint("Invalid Comment ID").Public("Could not find comment").Wrap(err)
		}

		if submittedRating != "LIKE" && submittedRating != "DISLIKE" {
			return eb.Public("Invalid rating. Must be LIKE or DISLIKE.").Errorf("Invalid rating. Must be LIKE or DISLIKE.")
		}

		safeSubmittedRating := data.Rating(submittedRating)

		tx, err := h.PgxConn.Begin(ctx.Request().Context())
		if err != nil {
			return eb.Hint("Could not start transaction").Wrap(err)
		}
		defer tx.Rollback(ctx.Request().Context())
		txQueries := h.Queries.WithTx(tx)

		// 1. Get existing rating
		userRating, _ := txQueries.GetUploadUserCommentRating(ctx.Request().Context(), data.GetUploadUserCommentRatingParams{
			UploadUserCommentID: commentId.Pg(),
			UserID:              ac.User.ID,
		})

		// 2. Delete any existing rating
		if err := txQueries.DeleteUploadUserCommentRating(
			ctx.Request().Context(),
			data.DeleteUploadUserCommentRatingParams{UploadUserCommentID: commentId.Pg(), UserID: ac.User.ID},
		); err != nil {
			return eb.Hint("Could not delete existing rating").Wrap(err)
		}

		// 3. If the new rating is different from any existing rating, record it
		if userRating != safeSubmittedRating {
			if err := txQueries.RecordUploadUserCommentRating(
				ctx.Request().Context(),
				data.RecordUploadUserCommentRatingParams{UploadUserCommentID: commentId.Pg(), UserID: ac.User.ID, Rating: safeSubmittedRating},
			); err != nil {
				return eb.Hint("Could not record new rating").Public("Error saving rating").Wrap(err)
			}
		}

		// 4. Commit transaction!
		if err = tx.Commit(ctx.Request().Context()); err != nil {
			return eb.Hint("Could not commit transaction").Wrap(err)
		}

		// 5. UI state
		ratingUiState(userRating, &safeSubmittedRating, &likes, &dislikes)

		// Submit partial response for HTMX
		if ctx.Request().Header.Get("HX-Request") == "true" {
			return components.CommentActions{
				Ac:        ac,
				UploadId:  id,
				ReplyOpen: false,
				CommentId: commentId,
				Likes:     likes,
				Dislikes:  dislikes,
			}.Render(ctx.Response())
		}

		// Redirect to media page
		return eb.Wrap(ctx.Redirect(http.StatusFound, "/media/"+id.Base58()))
	})

	g.POST("/:id/record", func(ctx echo.Context) error {
		eb := oops.In("handler::Media")

		ac, err := h.getAppContext(ctx)

		if err != nil {
			return eb.Hint("Could not get app context").Wrap(err)
		}

		id := ctx.Param("id")

		if id == "" {
			return eb.Errorf("missing id")
		}

		var req MediaRecordRequest
		if err := ctx.Bind(&req); err != nil {
			return eb.Hint("Could not parse json body").Wrap(err)
		}

		salt, err := h.Queries.GetTrackingSalt(ctx.Request().Context())
		if err != nil {
			return eb.Hint("Could not fetch tracking salt").Wrap(err)
		}

		hasher := xxhash.NewWithSeed(uint64(salt))
		hasher.Write([]byte("foo"))
		viewerHash := hasher.Sum64()

		// Serialize ranges as []byte
		jsonRanges, err := json.Marshal(req.Ranges)

		totalTime := lo.Reduce(req.Ranges, func(acc float64, r Range, _ int) float64 {
			return acc + (r.End - r.Start)
		}, 0)

		if req.ViewId == "" {
			uploadId, err := util.ParseUuid(id)
			if err != nil {
				return eb.Hint("Invalid upload ID").Wrap(err)
			}

			opts := data.RecordViewRangesParams{
				UploadRecordID: uploadId.Pg(),
				ViewerHash:     int64(viewerHash),
				Ranges:         jsonRanges,
				TotalTime:      totalTime,
			}

			if ac.Authenticated {
				opts.AppUserID = ac.User.ID
			}

			viewId, err := h.Queries.RecordViewRanges(ctx.Request().Context(), opts)
			if err != nil {
				return eb.Hint("Could not record view ranges").Wrap(err)
			}

			res := MediaRecordResponse{ViewId: util.Uuid(viewId.Bytes).Canonical()}
			ctx.JSON(http.StatusOK, res)
		} else {
			viewId, err := util.ParseUuid(req.ViewId)
			if err != nil {
				return eb.Hint("Invalid view ID").Wrap(err)
			}

			// Refreshing can cause duplicate views, but as long as viewing time is not overridden then that's okay
			// TODO: this comment was in the old code but I don't know why I was okay with this...
			err = h.Queries.UpdateViewRanges(ctx.Request().Context(), data.UpdateViewRangesParams{
				ID:        viewId.Pg(),
				Ranges:    jsonRanges,
				TotalTime: totalTime,
			})

			if err != nil {
				return eb.Hint("Could not update view ranges").Wrap(err)
			}

			res := MediaRecordResponse{ViewId: viewId.Canonical()}
			ctx.JSON(http.StatusOK, res)
		}

		return nil
	})
}
