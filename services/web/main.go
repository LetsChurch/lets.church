package main

import (
	"context"
	"log"
	"os"

	"lets.church/web/app/data"
	"lets.church/web/app/handler"

	"github.com/jackc/pgx/v5"
	"github.com/labstack/echo/v4"

	_ "github.com/lib/pq"
)

func main() {
	ctx := context.Background()

	conn, err := pgx.Connect(ctx, os.Getenv("DATABASE_URL"))
	if err != nil {
		log.Fatalln(err)
	}
	defer conn.Close(ctx)

	h := &handler.Handler{Queries: data.New(conn)}

	app := echo.New()
	app.File("/favicon.ico", "assets/favicon.ico")
	app.Static("/assets", "assets")
	app.GET("/", h.Home)
	app.GET("/about", h.About)
	app.GET("/about/:page", h.AboutPage)
	app.GET("/channels", h.Channels)
	app.GET("/churches", h.Churches)
	app.GET("/churches/add", h.ChurchesAdd)
	app.GET("/media/:id", h.Media)

	app.Logger.Fatal(app.Start("0.0.0.0:3000"))
}
