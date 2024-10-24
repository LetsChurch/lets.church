package main

import (
	"context"
	"encoding/gob"
	"encoding/json"
	"io/fs"
	"log"
	"net/http"
	"os"
	"strconv"
	"strings"

	"lets.church/cmd/server/components"
	"lets.church/cmd/server/handler"
	"lets.church/cmd/server/util"
	"lets.church/internal/data"
	gutil "lets.church/internal/util"

	"github.com/jackc/pgx/v5"
	"github.com/labstack/echo/v4"
	"github.com/labstack/echo/v4/middleware"
	"github.com/samber/oops"

	"embed"

	"github.com/contribsys/faktory/client"
	"github.com/gorilla/sessions"
	"github.com/labstack/echo-contrib/session"
	_ "github.com/lib/pq"

	"github.com/rs/zerolog"
	l "github.com/rs/zerolog/log"
)

//go:embed assets/*
var embeddedAssets embed.FS

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
	gutil.InitLogger()
	gob.Register(util.Flash{})
	ctx := context.Background()

	fsys, err := fs.Sub(embeddedAssets, "assets")
	if err != nil {
		log.Fatal(err)
	}

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
	app.Debug = debug
	setupErrorHandler(app)
	if debug {
		app.File("/favicon.ico", "cmd/server/assets/favicon.ico")
		app.Static("/assets", "cmd/server/assets")
	} else {
		app.GET("/favicon.ico", echo.WrapHandler(http.FileServerFS(fsys)))
		app.GET("/assets/*", echo.WrapHandler(http.StripPrefix("/assets/", http.FileServerFS(fsys))))
	}
	// Enable CORS and disable implicit credentials
	app.Use(middleware.CORS())
	app.Use(middleware.CSRFWithConfig(middleware.CSRFConfig{
		TokenLookup:    "cookie:_csrf",
		CookiePath:     "/",
		CookieSecure:   true,
		CookieHTTPOnly: true,
		CookieSameSite: http.SameSiteLaxMode,
	}))
	app.Use(session.Middleware(sessions.NewCookieStore([]byte(os.Getenv("COOKIE_SECRET")))))

	app.GET("/", h.Home)

	h.AboutRoutes(app)
	h.AuthRoutes(app)
	h.ChannelRoutes(app)
	h.ChurchesRoutes(app)
	h.MediaRoutes(app)

	app.POST("/newsletter/subscribe", h.PostNewsletterSubscribe)
	app.GET("/@:slug", func(c echo.Context) error {
		slug := c.Param("slug")
		return c.Redirect(http.StatusMovedPermanently, "/channel/"+slug)
	})

	app.Logger.Fatal(app.Start("0.0.0.0:3000"))
}

type Trigger struct {
	Flash struct {
		Html string `json:"html"`
	} `json:"flash"`
}

func setupErrorHandler(e *echo.Echo) {
	defaultHandler := e.HTTPErrorHandler

	e.HTTPErrorHandler = func(err error, c echo.Context) {
		code := http.StatusInternalServerError
		oopsErr, _ := oops.AsOops(err)
		originalErr := oopsErr.Unwrap()
		if he, ok := originalErr.(*echo.HTTPError); ok {
			code = he.Code
		}
		LogOops(l.Logger, oopsErr).Error().Send()

		if c.Request().Header.Get("HX-Request") != "" {
			// Get message
			message := oops.GetPublic(err, http.StatusText(code))

			// Make trigger payload
			trigger := Trigger{}
			htmlBuilder := strings.Builder{}
			components.Notification{
				Level:   "error",
				Title:   "Error",
				Message: message,
			}.Render(&htmlBuilder)
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

func LogOops(l zerolog.Logger, err oops.OopsError) *zerolog.Logger {
	ctx := l.With()
	for k, v := range err.ToMap() {
		ctx = ctx.Interface(k, v)
	}

	logger := ctx.Err(err).Logger()
	return &logger
}
