package components

import (
	"fmt"
	"io"
	"regexp"
	"strconv"

	"github.com/samber/lo"
	"lets.church/cmd/server/util"
	"lets.church/internal/data"
	gutil "lets.church/internal/util"
	g "maragu.dev/gomponents"
	hx "maragu.dev/gomponents-htmx"
	h "maragu.dev/gomponents/html"
)

type Comment struct {
	Ac       *util.AppContext
	UploadId string
	Root     data.GetUploadUserCommentsRow
	Children []data.GetUploadUserCommentsRow
	ReplyTo  string
}

var parare = regexp.MustCompile(`(\r?\n){2,}`)

func (c Comment) Render(w io.Writer) error {
	comment := h.Div(
		h.Class("lc-media__comment"),
		h.ID("comment-"+gutil.Uuid(c.Root.ID.Bytes).Base58()),
		Avatar{
			Name:   c.Root.Username.String,
			ImgKey: c.Root.AvatarPath.String,
			Size:   "sm",
		},
		h.Div(
			h.Class("lc-media__comment__main"),
			h.H3(h.Class("lc-media__comment__username"), g.Text(c.Root.Username.String)),
			g.Map(parare.Split(c.Root.Text, -1), func(pt string) g.Node {
				return h.P(g.Text(pt))
			}),
			CommentActions{
				Ac:        c.Ac,
				UploadId:  c.UploadId,
				CommentId: gutil.Uuid(c.Root.ID.Bytes).Base58(),
				IsReply:   c.ReplyTo != "",
				Likes:     c.Root.TotalLikes,
				Dislikes:  c.Root.TotalDislikes,
			},
			g.Iff(len(c.Children) > 0, func() g.Node {
				return h.Div(
					h.Class("lc-media__comment__replies"),
					g.Group(g.Map(c.Children, func(replyComment data.GetUploadUserCommentsRow) g.Node {
						return Comment{
							Ac:       c.Ac,
							UploadId: c.UploadId,
							Root:     replyComment,
							ReplyTo:  gutil.Uuid(c.Root.ID.Bytes).Base58(),
						}
					})),
				)
			}),
		),
	)

	return comment.Render(w)
}

type CommentActions struct {
	Ac        *util.AppContext
	UploadId  string
	CommentId string
	ReplyOpen bool
	IsReply   bool
	Likes     int64
	Dislikes  int64
}

func (ca CommentActions) Render(w io.Writer) error {
	return h.Div(
		h.Class("lc-media__comment__actions"),
		g.If(!ca.IsReply,
			Button{Small: true, Icon: "message-plus", Children: []g.Node{
				hx.Target("closest .lc-media__comment__actions"),
				hx.Swap("outerHTML"),
				hx.Get("/media/" + ca.UploadId + "/comment?replyingTo=" + ca.CommentId + "&likes=" + strconv.Itoa(int(ca.Likes)) + "&dislikes=" + strconv.Itoa(int(ca.Dislikes))),
				g.Text("Reply"),
			}},
		),
		h.Form(
			h.Class("contents"),
			h.Method("post"),
			h.Action("/media/"+ca.UploadId+"/comment/"+ca.CommentId+"/rate"),
			hx.Boost("false"),
			hx.Post("/media/"+ca.UploadId+"/comment/"+ca.CommentId+"/rate"),
			hx.Target("closest .lc-media__comment__actions"),
			h.Input(h.Type("hidden"), h.Name("likes"), h.Value(strconv.Itoa(int(ca.Likes)))),
			Button{
				Type:     "submit",
				Name:     "rating",
				Value:    "LIKE",
				Small:    true,
				Icon:     "thumb-up",
				Children: []g.Node{g.Text(strconv.FormatInt(ca.Likes, 10))},
				// TODO: figure this out
				// ActiveText: ca.UserRating == data.RatingDISLIKE,
			},
			h.Input(h.Type("hidden"), h.Name("dislikes"), h.Value(strconv.Itoa(int(ca.Dislikes)))),
			Button{
				Type:     "submit",
				Name:     "rating",
				Value:    "DISLIKE",
				Small:    true,
				Icon:     "thumb-down",
				Children: []g.Node{g.Text(strconv.FormatInt(ca.Dislikes, 10))},
				// TODO: figure this out
				// ActiveText: ca.UserRating == data.RatingDISLIKE,
			},
		),
		g.If(ca.ReplyOpen, CommentForm{Ac: ca.Ac, UploadId: ca.UploadId, ReplyingTo: ca.CommentId}),
	).Render(w)
}

type CommentCount struct {
	Count int
	Oob   bool
}

func (cc CommentCount) Render(w io.Writer) error {
	return h.H2(
		h.ID("comments-count"),
		h.Class("lc-media__section-title mt mb"),
		g.If(cc.Oob, hx.SwapOOB("true")),
		g.Text(lo.Ternary(cc.Count == 0, "No Comments", fmt.Sprintf("%v Comments", cc.Count))),
	).Render(w)
}

type CommentForm struct {
	Ac         *util.AppContext
	UploadId   string
	ReplyingTo string
}

func (cf CommentForm) Render(w io.Writer) error {
	return g.El("comment-form",
		h.Form(
			g.If(cf.ReplyingTo == "", h.ID("comment-form"+cf.ReplyingTo)),
			h.Method("post"),
			h.Action("/media/"+cf.UploadId+"/comment"),
			hx.Post("/media/"+cf.UploadId+"/comment"),
			hx.Trigger("keydown[key==='Enter'&&!shiftKey],submit"),
			hx.Target("#comments"),
			hx.Select("#comments"),
			h.Class("lc-media__comment-form"),
			Avatar{Name: cf.Ac.User.Username.String, ImgKey: cf.Ac.User.AvatarPath.String, Size: "sm", OnDark: true},
			h.Textarea(h.Name("comment"), h.Placeholder(lo.Ternary(cf.ReplyingTo == "", "Write a comment...", "Write a reply..."))),
			g.If(cf.ReplyingTo != "", h.Input(h.Type("hidden"), h.Name("replyingTo"), h.Value(cf.ReplyingTo))),
			Button{Primary: true, Type: "submit", Icon: "send"},
		),
	).Render(w)
}
