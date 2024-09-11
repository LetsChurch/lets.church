package handler

import (
	"net/http"

	"github.com/contribsys/faktory/client"
	"github.com/jackc/pgx/v5"
	"github.com/labstack/echo-contrib/session"
	"github.com/labstack/echo/v4"
	"github.com/samber/lo"
	"github.com/samber/oops"
	"lets.church/internal/data"
	"lets.church/internal/util"
)

type Handler struct {
	PgxConn            *pgx.Conn
	Queries            *data.Queries
	FaktoryClient      *client.Client
	PublicUrl          string
	JwtSecret          []byte
	ZxcvbnMinimumScore int
}

func (h *Handler) getAppSession(c echo.Context) (*data.GetSessionRow, error) {
	sess, _ := session.Get("session", c)
	sessionId := sess.Values["id"]

	if sessionId == nil {
		return nil, nil
	}

	eb := oops.In("getAppSession")
	sessionUuid, err := util.ParseUuid(sessionId.(string))

	if err != nil {
		return nil, eb.Wrap(err)
	}

	session, err := h.Queries.GetSession(c.Request().Context(), sessionUuid.Pg())

	return &session, eb.Wrap(err)
}

func (h *Handler) getAppUserFromSession(c echo.Context, session *data.GetSessionRow) (*data.GetUserByIdRow, error) {
	if session == nil {
		return nil, nil
	}

	eb := oops.In("getAppUserFromSession")
	userId := util.Uuid(session.AppUserID.Bytes)
	user, err := h.Queries.GetUserById(c.Request().Context(), userId.Pg())
	if err != nil {
		return nil, eb.Hint("Could not get user from session").Wrap(err)
	}

	return &user, nil
}

func (h *Handler) getAppContext(c echo.Context) (*util.AppContext, error) {
	sess, _ := session.Get("session", c)
	flashes := lo.Map(sess.Flashes(), func(f any, _ int) util.Flash {
		return f.(util.Flash)
	})
	eb := oops.In("getAppContext")
	err := sess.Save(c.Request(), c.Response())
	if err != nil {
		return nil, eb.Hint("Could not save session after getting flashes").Wrap(err)
	}

	appSession, err := h.getAppSession(c)
	if err != nil {
		return nil, eb.Hint("Could not get app session").Wrap(err)
	}

	appUser, err := h.getAppUserFromSession(c, appSession)

	return &util.AppContext{
		Flashes:       flashes,
		Authenticated: appSession != nil,
		CsrfToken:     c.Get("csrf").(string),
		User:          appUser,
	}, nil
}

func (h *Handler) addFlash(c echo.Context, f util.Flash) error {
	sess, _ := session.Get("session", c)
	sess.AddFlash(f)
	return sess.Save(c.Request(), c.Response())
}

func (h *Handler) checkCsrf(c echo.Context) error {
	csrf := c.FormValue("_csrf")
	if csrf != c.Get("csrf").(string) {
		return c.NoContent(http.StatusBadRequest)
	}
	return nil
}
