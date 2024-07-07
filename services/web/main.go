package main

import (
	"log"

	"lets.church/web/app/handler"

	"github.com/labstack/echo/v4"

	"github.com/jmoiron/sqlx"
	_ "github.com/lib/pq"
)

func main() {
	db, err := sqlx.Open("postgres", "postgres://letschurch:password@postgres:5432/letschurch?sslmode=disable")
	if err != nil {
		log.Fatalln(err)
	}

	h := &handler.Handler{Db: db}

	app := echo.New()
	app.File("/favicon.ico", "assets/favicon.ico")
	app.Static("/assets", "assets")
	app.GET("/", h.Media)
	app.GET("/about", h.About)
	app.GET("/about/:page", h.AboutPage)
	app.GET("/channels", h.Channels)
	app.GET("/churches", h.Churches)
	app.GET("/churches/add", h.ChurchesAdd)

	app.Logger.Fatal(app.Start("0.0.0.0:3000"))
}
