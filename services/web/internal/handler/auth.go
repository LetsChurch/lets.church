package handler

import (
	"errors"
	"fmt"
	"log"
	"net/http"
	"net/mail"
	"net/url"
	"time"

	"github.com/gorilla/sessions"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/labstack/echo-contrib/session"
	"github.com/labstack/echo/v4"
	"github.com/samber/lo"
	"github.com/samber/oops"
	"github.com/trustelem/zxcvbn"
	"lets.church/internal/data"
	"lets.church/internal/jobs/background-worker"
	"lets.church/internal/pages"
	"lets.church/internal/util"

	"github.com/alexedwards/argon2id"
	"github.com/golang-jwt/jwt/v5"
)

func (h *Handler) GetAuthLogin(c echo.Context) (err error) {
	eb := oops.In("GetAuthLogin")
	ac, err := h.getAppContext(c)
	if err != nil {
		return eb.Hint("Could not get app context").Wrap(err)
	}

	if ac.Authenticated {
		return c.Redirect(http.StatusForbidden, "/")
	}

	return Render(c, http.StatusOK, pages.Login(ac))
}

func (h *Handler) PostAuthLogin(c echo.Context) (err error) {
	eb := oops.In("PostAuthLogin")
	err = h.checkCsrf(c)

	if err != nil {
		return eb.Wrap(err)
	}

	ac, err := h.getAppContext(c)

	if err != nil {
		return eb.Hint("Could not get app context").Wrap(err)
	}

	if ac.Authenticated {
		return c.Redirect(http.StatusFound, "/")
	}

	id := c.FormValue("id")
	password := c.FormValue("password")
	remember := c.FormValue("remember") == "on"

	user, err := h.Queries.GetUser(c.Request().Context(), pgtype.Text{String: id, Valid: true})
	_ = user

	if err != nil {
		return eb.Public("Error logging in. Please check your credentials and try again.").Wrap(err)
	}

	match, err := argon2id.ComparePasswordAndHash(password, user.Password)
	if err != nil {
		log.Fatal(err)
	}

	if !match {
		return eb.Public("Error logging in. Please check your credentials and try again.").
			Errorf("Password did not match for user %v", id)
	}

	h.createSession(c, &user, remember)

	return c.Redirect(http.StatusFound, "/")
}

func (h *Handler) AuthLogout(c echo.Context) (err error) {
	sess, err := h.getAppSession(c)
	if err != nil {
		return err
	}

	if sess == nil {
		return c.Redirect(http.StatusFound, "/")
	}

	h.deleteSession(c, sess)

	return c.Redirect(http.StatusFound, "/")
}

func (h *Handler) GetAuthForgotPassword(c echo.Context) (err error) {
	ac, err := h.getAppContext(c)
	if err != nil {
		return err
	}

	if ac.Authenticated {
		return c.Redirect(http.StatusForbidden, "/")
	}

	return Render(c, http.StatusOK, pages.ForgotPassword(ac))
}

type ResetPasswordClaims struct {
	Id string `json:"id"`
	jwt.RegisteredClaims
}

func (h *Handler) PostAuthForgotPassword(c echo.Context) (err error) {
	eb := oops.In("PostAuthForgotPassword")
	err = h.checkCsrf(c)

	if err != nil {
		return eb.Wrap(err)
	}

	ac, err := h.getAppContext(c)

	if err != nil {
		return err
	}

	if ac.Authenticated {
		return c.Redirect(http.StatusFound, "/")
	}

	email := c.FormValue("email")

	h.addFlash(c, util.Flash{
		Level:   "success",
		Title:   "Check your email!",
		Message: "If you have an account you will receive an email with instructions to reset your password.",
	})

	user, err := h.Queries.GetUserByEmail(c.Request().Context(), pgtype.Text{String: email, Valid: true})
	if err != nil {
		return c.Redirect(http.StatusFound, "/")
	}

	userId := util.Uuid(user.ID.Bytes)

	token := jwt.NewWithClaims(jwt.SigningMethodHS256, ResetPasswordClaims{
		Id: userId.Canonical(),
		RegisteredClaims: jwt.RegisteredClaims{
			ExpiresAt: jwt.NewNumericDate(time.Now().Add(15 * time.Minute)),
		},
	})
	tokenString, err := token.SignedString(h.JwtSecret)
	if err != nil {
		return err
	}

	resetUrl := h.PublicUrl + "/auth/reset-password?token=" + tokenString

	html, err := util.MakeEmailHtml(util.MakeEmailHtmlArgs{
		Title:   "Welcome to Let's Church!",
		Preview: "Please verify your email.",
		Body: []string{
			"Hello! Please click <a href=\"" + resetUrl + "\">here</a> to reset your password.",
			"This link will expire in 15 minutes.",
			"If you did not request a password reset, please ignore this email.",
		},
	})
	if err != nil {
		return eb.Hint("Could not make password reset email HTML").Wrap(err)
	}

	err = jobs.QueueEmailJob(h.FaktoryClient, jobs.EmailArgs{
		From:    "hello@lets.church",
		To:      []string{email},
		Subject: "Reset Your Password For Let's Church",
		Text:    "Hello! Please visit the following link to reset your password: " + resetUrl + "\n\nThis link will expire in 15 minutes.\n\nIf you did not request a password reset, please ignore this email.",
		Html:    html,
	})
	if err != nil {
		return eb.Hint("Could not send reset password email").Wrap(err)
	}

	return c.Redirect(http.StatusFound, "/")
}

func (h *Handler) GetAuthRegister(c echo.Context) error {
	ac, err := h.getAppContext(c)
	if err != nil {
		return err
	}

	if ac.Authenticated {
		return c.Redirect(http.StatusForbidden, "/")
	}

	return Render(c, http.StatusOK, pages.Register(ac, pages.RegisterProps{}))
}

func (h *Handler) PostAuthCheckUsername(c echo.Context) (err error) {
	eb := oops.In("PostAuthCheckUsername")
	err = h.checkCsrf(c)

	if err != nil {
		return eb.Wrap(err)
	}

	username := c.FormValue("username")
	userExists, err := h.Queries.UserExists(c.Request().Context(), pgtype.Text{String: username, Valid: true})
	if err != nil {
		return err
	}

	return Render(c, http.StatusOK, pages.RegisterUsernameInput(
		pages.RegisterUsernameInputProps{
			Value: username,
			Error: lo.Ternary(userExists, "Username has already been taken", ""),
		},
	))
}

func (h *Handler) PostAuthRegister(c echo.Context) error {
	eb := oops.In("PostAuthRegister")
	err := h.checkCsrf(c)

	if err != nil {
		return eb.Wrap(err)
	}

	ac, err := h.getAppContext(c)
	if err != nil {
		return eb.Hint("Could not get app context").Wrap(err)
	}

	if ac.Authenticated {
		return c.Redirect(http.StatusForbidden, "/")
	}

	username := c.FormValue("username")
	password := c.FormValue("password")
	email := c.FormValue("email")
	fullname := c.FormValue("fullname")
	subscribeToNewsletter := c.FormValue("newsletter") == "on"

	_, emailErr := mail.ParseAddress(email)

	if len(username) < 3 || emailErr != nil {
		return eb.Public("Invalid email address.").Wrap(emailErr)
	}

	zRes := zxcvbn.PasswordStrength(password, []string{username, email})

	if zRes.Score < h.ZxcvbnMinimumScore {
		return eb.Public("Please pick a stronger password. Try to avoid repeated characters and common sequences, and make sure your password is long.").
			Errorf("Password too weak: %d", zRes.Score)
	}

	hash, err := argon2id.CreateHash(password, argon2id.DefaultParams)
	if err != nil {
		return eb.Hint("Could not create argon2id password hash").Wrap(err)
	}

	tx, err := h.PgxConn.Begin(c.Request().Context())
	if err != nil {
		return eb.Hint("Could not start Postgres transaction").Wrap(err)
	}

	qtx := h.Queries.WithTx(tx)
	appUserId, err := qtx.CreateUser(c.Request().Context(), data.CreateUserParams{
		Username: pgtype.Text{String: username, Valid: true},
		Password: hash,
		FullName: pgtype.Text{String: fullname, Valid: len(fullname) > 0},
	})
	if err != nil {
		tx.Rollback(c.Request().Context())
		return eb.Hint("Could not create user").Wrap(err)
	}

	emailRow, err := qtx.CreateUserEmail(
		c.Request().Context(),
		data.CreateUserEmailParams{AppUserID: appUserId, Email: pgtype.Text{String: email, Valid: true}},
	)
	if err != nil {
		tx.Rollback(c.Request().Context())
		return eb.Hint("Email address is probably already registered").Wrap(err)
	}

	if err := tx.Commit(c.Request().Context()); err != nil {
		return eb.Hint("Could not commit Postgres transaction").Wrap(err)
	}

	params := url.Values{}
	params.Add("userId", util.Uuid(appUserId.Bytes).Base58())
	params.Add("emailId", util.Uuid(emailRow.ID.Bytes).Base58())
	params.Add("emailKey", util.Uuid(emailRow.Key.Bytes).Base58())
	verifyUrl := h.PublicUrl + "/auth/verify?" + params.Encode()
	html, err := util.MakeEmailHtml(util.MakeEmailHtmlArgs{
		Title:   "Welcome to Let's Church!",
		Preview: "Please verify your email.",
		Body: []string{
			"Welcome to Let's Church, <b>" + username + "</b>! Please click <a href=\"" + verifyUrl + "\" target=\"_blank\">here</a> to verify your email.",
		},
	})
	if err != nil {
		return eb.Hint("Could not generate HTML for email validation email").Wrap(err)
	}

	err = jobs.QueueEmailJob(h.FaktoryClient, jobs.EmailArgs{
		From:    "hello@lets.church",
		To:      []string{email},
		Subject: "Welcome to Let's Church! Please verify your email.",
		Text:    "Welcome, " + username + "! Please visit the following link to verify your email: " + verifyUrl,
		Html:    html,
	})
	if err != nil {
		return eb.Hint("Could not send email verification email").Wrap(err)
	}

	if subscribeToNewsletter {
		h.Queries.SubscribeToNewsletter(c.Request().Context(), pgtype.Text{String: email, Valid: true})
	}

	h.addFlash(c, util.Flash{Level: "success", Title: "Check your email!", Message: "We sent an email to " + email + " for verification."})

	return c.Redirect(http.StatusFound, "/")
}

func (h *Handler) GetAuthVerify(c echo.Context) error {
	userId, err := util.ParseUuid(c.QueryParam("userId"))
	if err != nil {
		return c.NoContent(http.StatusNotFound)
	}
	emailId, err := util.ParseUuid(c.QueryParam("emailId"))
	if err != nil {
		return c.NoContent(http.StatusNotFound)
	}
	emailKey, err := util.ParseUuid(c.QueryParam("emailKey"))
	if err != nil {
		return c.NoContent(http.StatusNotFound)
	}

	count, err := h.Queries.VerifyEmail(c.Request().Context(), data.VerifyEmailParams{AppUserID: userId.Pg(), EmailID: emailId.Pg(), Key: emailKey.Pg()})

	if err != nil || count == 0 {
		return c.NoContent(http.StatusNotFound)
	}

	return c.Redirect(http.StatusFound, "/")
}

func (h *Handler) GetAuthResetPassword(c echo.Context) error {
	eb := oops.In("GetAuthResetPassword")
	ac, err := h.getAppContext(c)
	if err != nil {
		return eb.Hint("Could not get app context").Wrap(err)
	}

	tokenString := c.QueryParam("token")

	token, err := jwt.Parse(tokenString, func(token *jwt.Token) (interface{}, error) {
		if _, ok := token.Method.(*jwt.SigningMethodHMAC); !ok {
			return nil, eb.Public("Invalid token").Errorf("unexpected signing method: %v", token.Header["alg"])
		}

		return h.JwtSecret, nil
	})
	if err != nil {
		return eb.Public("Invalid token").Wrap(err)
	}

	if _, ok := token.Claims.(jwt.MapClaims); !ok {
		return eb.Public("Invalid token").Wrap(err)
	}

	return Render(c, http.StatusOK, pages.ResetPassword(ac, pages.ResetPasswordProps{Token: tokenString}))
}

func (h *Handler) PostAuthResetPassword(c echo.Context) error {
	eb := oops.In("PostAuthResetPassword")
	err := h.checkCsrf(c)

	if err != nil {
		return eb.Wrap(err)
	}

	ac, err := h.getAppContext(c)
	if err != nil {
		return eb.Hint("Could not get app context").Wrap(err)
	}

	if ac.Authenticated {
		return c.Redirect(http.StatusForbidden, "/")
	}

	tokenString := c.QueryParam("token")

	token, err := jwt.Parse(tokenString, func(token *jwt.Token) (interface{}, error) {
		if _, ok := token.Method.(*jwt.SigningMethodHMAC); !ok {
			return nil, fmt.Errorf("unexpected signing method: %v", token.Header["alg"])
		}

		return h.JwtSecret, nil
	})
	if err != nil {
		return eb.Public("Invalid token").Wrap(err)
	}

	if claims, ok := token.Claims.(jwt.MapClaims); ok {
		id, _ := util.ParseUuid(claims["id"].(string))
		password := c.FormValue("password")
		if password == "" {
			return eb.Public("Missing new password").Errorf("missing password")
		}

		// TODO: user inputs instead of nil?
		zRes := zxcvbn.PasswordStrength(password, nil)

		if zRes.Score < h.ZxcvbnMinimumScore {
			return eb.Public("Please pick a stronger password. Try to avoid repeated characters and common sequences, and make sure your password is long.").
				Errorf("Password too weak: %d", zRes.Score)
		}

		hash, err := argon2id.CreateHash(password, argon2id.DefaultParams)
		if err != nil {
			return eb.Hint("Could not create argon2id password hash").Wrap(err)
		}

		h.Queries.ChangePassword(c.Request().Context(), data.ChangePasswordParams{ID: id.Pg(), Password: hash})

		h.addFlash(c, util.Flash{
			Level:   "success",
			Title:   "Password changed!",
			Message: "Your password has been changed. You can now log in with your new password.",
		})

		return c.Redirect(http.StatusFound, "/auth/login")
	}

	return errors.New("could not get token claims")
}

func (h *Handler) createSession(c echo.Context, user *data.GetUserRow, remember bool) (*util.Uuid, error) {
	eb := oops.In("createSession")
	res, err := h.Queries.CreateSession(c.Request().Context(), user.ID)
	if err != nil {
		return nil, eb.Hint("Could not create session in Postgres").Wrap(err)
	}

	sessionId := util.Uuid(res.Bytes)

	sess, err := session.Get("session", c)
	if err != nil {
		return nil, eb.Hint("Could not get session").Wrap(err)
	}

	sess.Options = &sessions.Options{
		Path:     "/",
		MaxAge:   lo.Ternary(remember, 60*60*24*30, 0),
		HttpOnly: true,
	}
	sess.Values["id"] = sessionId.Canonical()

	if err := sess.Save(c.Request(), c.Response()); err != nil {
		return nil, eb.Hint("Could not save session to response").Wrap(err)
	}

	return &sessionId, nil
}

func (h *Handler) deleteSession(c echo.Context, sessionRow *data.GetSessionRow) error {
	eb := oops.In("deleteSession")
	sess, err := session.Get("session", c)
	if err != nil {
		return eb.Hint("Could not get session to delete").Wrap(err)
	}

	sess.Values["id"] = nil

	if err := sess.Save(c.Request(), c.Response()); err != nil {
		return eb.Hint("Could not save session to response").Wrap(err)
	}

	return eb.Hint("Could not delete session from Postgres").
		Wrap(h.Queries.DeleteSession(c.Request().Context(), sessionRow.ID))
}
