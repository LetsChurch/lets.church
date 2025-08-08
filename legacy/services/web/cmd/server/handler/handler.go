package handler

import (
	"net/http"

	"github.com/contribsys/faktory/client"
	"github.com/jackc/pgx/v5"
	"github.com/labstack/echo-contrib/session"
	"github.com/labstack/echo/v4"
	"github.com/samber/lo"
	"github.com/samber/oops"
	"lets.church/cmd/server/util"
	"lets.church/internal/data"
	gutil "lets.church/internal/util"
)

type Handler struct {
	PgxConn            *pgx.Conn
	Queries            *data.Queries
	FaktoryClient      *client.Client
	PublicUrl          string
	JwtSecret          []byte
	ZxcvbnMinimumScore int
}

func (h *Handler) getAppSession(c echo.Context) (*data.GetValidSessionRow, error) {
	sess, _ := session.Get("session", c)
	sessionId := sess.Values["id"]

	if sessionId == nil {
		return nil, nil
	}

	eb := oops.In("getAppSession")
	sessionUuid, err := gutil.ParseUuid(sessionId.(string))

	if err != nil {
		return nil, eb.Wrap(err)
	}

	session, err := h.Queries.GetValidSession(c.Request().Context(), sessionUuid.Pg())

	if len(session) == 0 {
		return nil, eb.Errorf("No valid session found")
	}

	return &session[0], eb.Wrap(err)
}

func (h *Handler) getAppUserFromSession(c echo.Context, session *data.GetValidSessionRow) (*data.GetUserByIdRow, error) {
	if session == nil {
		return nil, nil
	}

	eb := oops.In("getAppUserFromSession")
	userId := gutil.Uuid(session.AppUserID.Bytes)
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

	appSession, _ := h.getAppSession(c)
	appUser, _ := h.getAppUserFromSession(c, appSession)

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
