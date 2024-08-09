package main

import (
	"context"
	"log"
	"net/http"
	"os"

	"lets.church/web/app/data"
	"lets.church/web/app/handler"

	"github.com/jackc/pgx/v5"
	"github.com/labstack/echo/v4"
	"github.com/labstack/echo/v4/middleware"

	"github.com/gorilla/sessions"
	"github.com/labstack/echo-contrib/session"
	_ "github.com/lib/pq"
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
	ctx := context.Background()

	conn := getDbConn(ctx)
	defer conn.Close(ctx)

	h := &handler.Handler{Queries: data.New(conn)}

	app := echo.New()
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
	app.GET("/auth/login", h.GetAuthLogin)
	app.POST("/auth/login", h.PostAuthLogin)
	app.POST("/auth/logout", h.AuthLogout)
	app.GET("/channels", h.Channels)
	app.GET("/churches", h.Churches)
	app.GET("/churches/add", h.ChurchesAdd)
	app.GET("/media/:id", h.Media)

	app.Logger.Fatal(app.Start("0.0.0.0:3000"))
}
