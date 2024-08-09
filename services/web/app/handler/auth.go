package handler

import (
	"log"
	"net/http"

	"github.com/gorilla/sessions"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/labstack/echo-contrib/session"
	"github.com/labstack/echo/v4"
	"github.com/samber/lo"
	"lets.church/web/app/data"
	"lets.church/web/app/pages"
	"lets.church/web/app/util"

	"github.com/alexedwards/argon2id"
)

func (h *Handler) GetAuthLogin(c echo.Context) (err error) {
	sess, _ := session.Get("session", c)

	if sess.Values["id"] != nil {
		return c.Redirect(http.StatusFound, "/")
	}

	return Render(c, http.StatusOK, pages.Login(pages.LoginProps{Csrf: c.Get("csrf").(string)}))
}

func (h *Handler) PostAuthLogin(c echo.Context) (err error) {
	sess, err := h.getSession(c)
	if err != nil {
		return err
	}

	if sess != nil {
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
		return Render(c, http.StatusOK, pages.Login(pages.LoginProps{Csrf: csrf}))
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

func (h *Handler) getSession(c echo.Context) (*data.GetSessionRow, error) {
	sess, err := session.Get("session", c)
	if err != nil {
		return nil, err
	}

	if sess.Values["id"] == nil {
		return nil, nil
	}

	session_id, err := util.Parse(sess.Values["id"].(string))
	if err != nil {
		return nil, err
	}

	appSession, err := h.Queries.GetSession(c.Request().Context(), session_id.Pg())

	return &appSession, err
}

func (h *Handler) createSession(c echo.Context, user *data.AppUser, remember bool) (*util.Uuid, error) {
	res, err := h.Queries.CreateSession(c.Request().Context(), user.ID)
	if err != nil {
		return nil, err
	}

	session_id := util.Uuid(res.Bytes)

	sess, err := session.Get("session", c)
	if err != nil {
		return nil, err
	}

	sess.Options = &sessions.Options{
		Path:     "/",
		MaxAge:   lo.Ternary(remember, 60*60*24*30, 0),
		HttpOnly: true,
	}
	sess.Values["id"] = session_id.Canonical()

	if err := sess.Save(c.Request(), c.Response()); err != nil {
		return nil, err
	}

	return &session_id, nil
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
