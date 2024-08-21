package handler

import (
	"github.com/contribsys/faktory/client"
	"github.com/jackc/pgx/v5"
	"github.com/labstack/echo-contrib/session"
	"github.com/labstack/echo/v4"
	"github.com/samber/lo"
	"lets.church/web/app/data"
	"lets.church/web/app/util"
)

type Handler struct {
	PgxConn            *pgx.Conn
	Queries            *data.Queries
	FaktoryClient      *client.Client
	PublicUrl          string
	JwtSecret          []byte
	ZxcvbnMinimumScore int
}

func (h *Handler) getAppContext(c echo.Context) (*util.AppContext, error) {
	sess, _ := session.Get("session", c)
	flashes := lo.Map(sess.Flashes(), func(f any, _ int) util.Flash {
		return f.(util.Flash)
	})
	err := sess.Save(c.Request(), c.Response())
	if err != nil {
		return nil, err
	}
	sessionId := sess.Values["id"]
	return &util.AppContext{
		Flashes:       flashes,
		Authenticated: sessionId != nil,
		SessionId: lo.IfF(sessionId != nil, func() *util.Uuid {
			id, err := util.ParseUuid(sessionId.(string))
			if err != nil {
				return nil
			}
			return &id
		}).Else(nil),
	}, nil
}

func (h *Handler) addFlash(c echo.Context, f util.Flash) error {
	sess, _ := session.Get("session", c)
	sess.AddFlash(f)
	return sess.Save(c.Request(), c.Response())
}
