package util

import (
	"io"
	"log"
	"os"

	axiomAdapter "github.com/axiomhq/axiom-go/adapters/zerolog"
	"github.com/rs/zerolog"
	l "github.com/rs/zerolog/log"
	"github.com/samber/lo"
)

func InitLogger() {
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
}
