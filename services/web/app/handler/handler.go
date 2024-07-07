package handler

import "github.com/jmoiron/sqlx"

type Handler struct {
	Db *sqlx.DB
}
