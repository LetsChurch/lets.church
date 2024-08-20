package handler

import (
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"net/http"
	"net/mail"
	"net/url"
	"time"

	"github.com/contribsys/faktory/client"
	"github.com/google/uuid"
	"github.com/gorilla/sessions"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/labstack/echo-contrib/session"
	"github.com/labstack/echo/v4"
	"github.com/samber/lo"
	"github.com/trustelem/zxcvbn"
	"lets.church/web/app/data"
	"lets.church/web/app/pages"
	"lets.church/web/app/util"
	"lets.church/web/background-worker/jobs"

	"github.com/alexedwards/argon2id"
	"github.com/golang-jwt/jwt/v5"
)

func (h *Handler) GetAuthLogin(c echo.Context) (err error) {
	ac, err := h.getAppContext(c)
	if err != nil {
		return err
	}

	if ac.Authenticated {
		return c.Redirect(http.StatusForbidden, "/")
	}

	return Render(c, http.StatusOK, pages.Login(ac, pages.LoginProps{Csrf: c.Get("csrf").(string)}))
}

func (h *Handler) PostAuthCheckUsername(c echo.Context) (err error) {
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

func (h *Handler) PostAuthLogin(c echo.Context) (err error) {
	ac, err := h.getAppContext(c)
	if err != nil {
		return err
	}

	if ac.Authenticated {
		return c.Redirect(http.StatusFound, "/")
	}

	csrf := c.FormValue("_csrf")

	if c.Get("csrf").(string) != csrf {
		return c.NoContent(http.StatusBadRequest)
	}

	id := c.FormValue("id")
	password := c.FormValue("password")
	remember := c.FormValue("remember") == "on"

	user, err := h.Queries.GetUser(c.Request().Context(), pgtype.Text{String: id, Valid: true})
	_ = user

	if err != nil {
		return err
	}

	match, err := argon2id.ComparePasswordAndHash(password, user.Password)
	if err != nil {
		log.Fatal(err)
	}

	if !match {
		// TODO: Show error message
		return Render(c, http.StatusOK, pages.Login(ac, pages.LoginProps{Csrf: csrf}))
	}

	h.createSession(c, &user, remember)

	return c.Redirect(http.StatusFound, "/")
}

func (h *Handler) AuthLogout(c echo.Context) (err error) {
	sess, err := h.getSession(c)
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

	return Render(c, http.StatusOK, pages.ForgotPassword(ac, pages.ForgotPasswordProps{Csrf: c.Get("csrf").(string)}))
}

type ResetPasswordClaims struct {
	Id string `json:"id"`
	jwt.RegisteredClaims
}

func (h *Handler) PostAuthForgotPassword(c echo.Context) (err error) {
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

	emailJob := jobs.EmailArgs{
		From:    "hello@lets.church",
		To:      []string{email},
		Subject: "Reset Your Password For Let's Church",
		Text:    "Hello! Please visit the following link to reset your password: " + resetUrl + "\n\nThis link will expire in 15 minutes.\n\nIf you did not request a password reset, please ignore this email.",
		Html:    "Hello! Please click <a href=\"" + resetUrl + "\">here</a> to reset your password.\n\nThis link will expire in 15 minutes.\n\nIf you did not request a password reset, please ignore this email.",
	}
	emailJson, err := json.Marshal(emailJob)
	if err != nil {
		return err
	}

	err = h.FaktoryClient.Push(&client.Job{
		Queue: "background",
		Type:  "SendEmail",
		Args:  []any{string(emailJson)},
		Jid:   uuid.NewString(),
	})
	if err != nil {
		return err
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

	return Render(c, http.StatusOK, pages.Register(ac, pages.RegisterProps{Csrf: c.Get("csrf").(string)}))
}

func (h *Handler) PostAuthRegister(c echo.Context) error {
	ac, err := h.getAppContext(c)
	if err != nil {
		return err
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
		h.addFlash(c, util.Flash{Level: "warning", Title: "Invalid", Message: "Invalid form values."})
		// TODO: keep form values, maybe via trigger
		return c.Redirect(http.StatusFound, "/auth/register")
	}

	zRes := zxcvbn.PasswordStrength(password, []string{username, email})

	if zRes.Score < h.ZxcvbnMinimumScore {
		h.addFlash(c, util.Flash{Level: "warning", Title: "Weak password", Message: "Please pick a stronger password. Try to avoid repeated characters and common sequences, and make sure your password is long."})
		// TODO: keep form values, maybe via trigger
		return c.Redirect(http.StatusFound, "/auth/register")
	}

	hash, err := argon2id.CreateHash(password, argon2id.DefaultParams)
	if err != nil {
		return err
	}

	tx, err := h.PgxConn.Begin(c.Request().Context())
	if err != nil {
		return err
	}

	qtx := h.Queries.WithTx(tx)
	appUserId, err := qtx.CreateUser(c.Request().Context(), data.CreateUserParams{
		Username: pgtype.Text{String: username, Valid: true},
		Password: hash,
		FullName: pgtype.Text{String: fullname, Valid: len(fullname) > 0},
	})
	if err != nil {
		tx.Rollback(c.Request().Context())
		return err
	}

	emailRow, err := qtx.CreateUserEmail(
		c.Request().Context(),
		data.CreateUserEmailParams{AppUserID: appUserId, Email: pgtype.Text{String: email, Valid: true}},
	)
	if err != nil {
		tx.Rollback(c.Request().Context())
		return err
	}

	if err := tx.Commit(c.Request().Context()); err != nil {
		return err
	}

	params := url.Values{}
	params.Add("userId", util.Uuid(appUserId.Bytes).Base58())
	params.Add("emailId", util.Uuid(emailRow.ID.Bytes).Base58())
	params.Add("emailKey", util.Uuid(emailRow.Key.Bytes).Base58())
	verifyUrl := h.PublicUrl + "/auth/verify?" + params.Encode()
	emailJob := jobs.EmailArgs{
		From:    "hello@lets.church",
		To:      []string{email},
		Subject: "Welcome to Let's Church! Please verify your email.",
		Text:    "Welcome, " + username + "! Please visit the following link to verify your email: " + verifyUrl,
		Html:    "Welcome to Let's Church, <b>" + username + "</b>! Please click <a href=\"" + verifyUrl + "\">here</a> to verify your email.",
	}
	emailJson, err := json.Marshal(emailJob)
	if err != nil {
		return err
	}

	err = h.FaktoryClient.Push(&client.Job{
		Queue: "background",
		Type:  "SendEmail",
		Args:  []any{string(emailJson)},
		Jid:   uuid.NewString(),
	})
	if err != nil {
		return err
	}

	if subscribeToNewsletter {
		h.Queries.SubscribeToNewsletter(c.Request().Context(), pgtype.Text{String: email, Valid: true})
	}

	return c.Redirect(http.StatusFound, "/")
}

func (h *Handler) GetAuthVerify(c echo.Context) error {
	userId, err := util.Parse(c.QueryParam("userId"))
	if err != nil {
		return c.NoContent(http.StatusNotFound)
	}
	emailId, err := util.Parse(c.QueryParam("emailId"))
	if err != nil {
		return c.NoContent(http.StatusNotFound)
	}
	emailKey, err := util.Parse(c.QueryParam("emailKey"))
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
	ac, err := h.getAppContext(c)
	if err != nil {
		return err
	}

	tokenString := c.QueryParam("token")

	token, err := jwt.Parse(tokenString, func(token *jwt.Token) (interface{}, error) {
		if _, ok := token.Method.(*jwt.SigningMethodHMAC); !ok {
			return nil, fmt.Errorf("unexpected signing method: %v", token.Header["alg"])
		}

		return h.JwtSecret, nil
	})
	if err != nil {
		return err
	}

	if _, ok := token.Claims.(jwt.MapClaims); !ok {
		return err
	}

	return Render(c, http.StatusOK, pages.ResetPassword(ac, pages.ResetPasswordProps{Csrf: c.Get("csrf").(string), Token: tokenString}))
}

func (h *Handler) PostAuthResetPassword(c echo.Context) error {
	ac, err := h.getAppContext(c)
	if err != nil {
		return err
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
		return err
	}

	if claims, ok := token.Claims.(jwt.MapClaims); ok {
		id, _ := util.Parse(claims["id"].(string))
		password := c.FormValue("password")
		if password == "" {
			return errors.New("missing password")
		}

		// TODO: user inputs instead of nil?
		zRes := zxcvbn.PasswordStrength(password, nil)

		if zRes.Score < h.ZxcvbnMinimumScore {
			h.addFlash(c, util.Flash{Level: "warning", Title: "Weak password", Message: "Please pick a stronger password. Try to avoid repeated characters and common sequences, and make sure your password is long."})
			return c.Redirect(http.StatusFound, "/auth/reset-password?token="+tokenString)
		}

		hash, err := argon2id.CreateHash(password, argon2id.DefaultParams)
		if err != nil {
			return err
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

func (h *Handler) getSession(c echo.Context) (*data.GetSessionRow, error) {
	ac, err := h.getAppContext(c)
	if err != nil {
		return nil, err
	}

	if !ac.Authenticated {
		return nil, nil
	}

	appSession, err := h.Queries.GetSession(c.Request().Context(), ac.SessionId.Pg())

	return &appSession, err
}

func (h *Handler) createSession(c echo.Context, user *data.AppUser, remember bool) (*util.Uuid, error) {
	res, err := h.Queries.CreateSession(c.Request().Context(), user.ID)
	if err != nil {
		return nil, err
	}

	sessionId := util.Uuid(res.Bytes)

	sess, err := session.Get("session", c)
	if err != nil {
		return nil, err
	}

	sess.Options = &sessions.Options{
		Path:     "/",
		MaxAge:   lo.Ternary(remember, 60*60*24*30, 0),
		HttpOnly: true,
	}
	sess.Values["id"] = sessionId.Canonical()

	if err := sess.Save(c.Request(), c.Response()); err != nil {
		return nil, err
	}

	return &sessionId, nil
}

func (h *Handler) deleteSession(c echo.Context, sessionRow *data.GetSessionRow) error {
	sess, err := session.Get("session", c)
	if err != nil {
		return err
	}

	sess.Values["id"] = nil

	if err := sess.Save(c.Request(), c.Response()); err != nil {
		return err
	}

	return h.Queries.DeleteSession(c.Request().Context(), sessionRow.ID)
}
