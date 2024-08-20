package main

import (
	"context"
	"encoding/gob"
	"encoding/json"
	"io"
	"log"
	"net/http"
	"os"
	"strconv"
	"strings"

	"lets.church/web/app/components"
	"lets.church/web/app/data"
	"lets.church/web/app/handler"
	"lets.church/web/app/util"

	"github.com/jackc/pgx/v5"
	"github.com/labstack/echo/v4"
	"github.com/labstack/echo/v4/middleware"
	"github.com/samber/lo"
	"github.com/samber/oops"

	"github.com/contribsys/faktory/client"
	"github.com/gorilla/sessions"
	"github.com/labstack/echo-contrib/session"
	_ "github.com/lib/pq"

	axiomAdapter "github.com/axiomhq/axiom-go/adapters/zerolog"
	"github.com/rs/zerolog"
	l "github.com/rs/zerolog/log"
)

func getDbConn(ctx context.Context) *pgx.Conn {
	conn, err := pgx.Connect(ctx, os.Getenv("DATABASE_URL"))
	if err != nil {
		log.Fatalln(err)
	}

	dataTypeNames := []string{
		"upload_variant",
		"_upload_variant",
	}

	for _, typeName := range dataTypeNames {
		dataType, err := conn.LoadType(ctx, typeName)
		if err != nil {
			log.Fatalln(err)
		}
		conn.TypeMap().RegisterType(dataType)
	}

	return conn
}

func main() {
	debug := os.Getenv("APP_ENV") == "development"
	l.Logger = zerolog.New(lo.TernaryF(
		debug,
		func() io.Writer {
			return zerolog.ConsoleWriter{Out: os.Stderr}
		},
		func() io.Writer {
			writer, err := axiomAdapter.New()
			if err != nil {
				log.Fatal(err)
			}
			return io.MultiWriter(writer, os.Stderr)
		},
	))
	gob.Register(util.Flash{})
	ctx := context.Background()

	conn := getDbConn(ctx)
	defer conn.Close(ctx)

	faktoryClient, err := client.Open()
	if err != nil {
		log.Fatalf("Failed to connect to Faktory: %v", err)
	}
	defer faktoryClient.Close()

	zxcvbnMinimumScore, err := strconv.Atoi(os.Getenv("ZXCVBN_MINIMUM_SCORE"))
	if err != nil {
		log.Fatalf("Error getting ZXCVBN_MINIMUM_SCORE: %v", err)
	}

	h := &handler.Handler{
		PgxConn: conn,
		// TODO: use pool
		Queries:            data.New(conn),
		JwtSecret:          []byte(os.Getenv("JWT_SECRET")),
		FaktoryClient:      faktoryClient,
		PublicUrl:          os.Getenv("PUBLIC_URL"),
		ZxcvbnMinimumScore: zxcvbnMinimumScore,
	}

	app := echo.New()
	app.Debug = os.Getenv("APP_ENV") == "development"
	setupErrorHandler(app)
	app.File("/favicon.ico", "assets/favicon.ico")
	app.Static("/assets", "assets")
	app.Use(middleware.CSRFWithConfig(middleware.CSRFConfig{
		TokenLookup:    "cookie:_csrf",
		CookiePath:     "/",
		CookieSecure:   true,
		CookieHTTPOnly: true,
		CookieSameSite: http.SameSiteStrictMode,
	}))
	app.Use(session.Middleware(sessions.NewCookieStore([]byte(os.Getenv("COOKIE_SECRET")))))
	app.GET("/", h.Home)
	app.GET("/about", h.About)
	app.GET("/about/:page", h.AboutPage)
	app.POST("/auth/check-username", h.PostAuthCheckUsername)
	app.GET("/auth/forgot-password", h.GetAuthForgotPassword)
	app.POST("/auth/forgot-password", h.PostAuthForgotPassword)
	app.GET("/auth/login", h.GetAuthLogin)
	app.POST("/auth/login", h.PostAuthLogin)
	app.POST("/auth/logout", h.AuthLogout)
	app.GET("/auth/register", h.GetAuthRegister)
	app.POST("/auth/register", h.PostAuthRegister)
	app.GET("/auth/reset-password", h.GetAuthResetPassword)
	app.POST("/auth/reset-password", h.PostAuthResetPassword)
	app.GET("/auth/verify", h.GetAuthVerify)
	app.GET("/channels", h.Channels)
	app.GET("/churches", h.Churches)
	app.GET("/churches/add", h.ChurchesAdd)
	app.GET("/media/:id", h.Media)

	app.Logger.Fatal(app.Start("0.0.0.0:3000"))
}

type Trigger struct {
	Flash struct {
		Html string `json:"html"`
	} `json:"flash"`
}

const ISE = "Internal server error"

func setupErrorHandler(e *echo.Echo) {
	defaultHandler := e.HTTPErrorHandler

	e.HTTPErrorHandler = func(err error, c echo.Context) {
		l.Logger.Error().AnErr("echo", err).Send()
		if c.Request().Header.Get("HX-Request") != "" {
			// Get message
			message := oops.GetPublic(err, ISE)

			// Make trigger payload
			trigger := Trigger{}
			htmlBuilder := strings.Builder{}
			components.Notification(components.NotificationProps{
				Level:   "error",
				Title:   "Error",
				Message: message,
			}).Render(&htmlBuilder)
			trigger.Flash.Html = htmlBuilder.String()
			triggerJson, jsonErr := json.Marshal(trigger)

			// Set trigger
			if jsonErr == nil {
				c.Response().Header().Set("HX-Trigger", string(triggerJson))
			}
		}

		defaultHandler(err, c)
	}
}
