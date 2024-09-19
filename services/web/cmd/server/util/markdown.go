package util

import (
	"bytes"
	"html/template"
	"sync"

	"github.com/yuin/goldmark"
	"github.com/yuin/goldmark/parser"
	"github.com/yuin/goldmark/renderer/html"
)

var unsafeMd = goldmark.New(
	goldmark.WithParserOptions(
		parser.WithAttribute(),
	),
	goldmark.WithRendererOptions(
		html.WithUnsafe(),
	),
)

func OnceUnsafeMd(source []byte) func() string {
	return sync.OnceValue(func() string {
		var buf bytes.Buffer
		if err := unsafeMd.Convert(source, &buf); err != nil {
			panic(err)
		}
		return buf.String()
	})
}

func OnceUnsafeMdTmpl(name string, source []byte) func() *template.Template {
	return sync.OnceValue(func() *template.Template {
		var buf bytes.Buffer
		if err := unsafeMd.Convert(source, &buf); err != nil {
			panic(err)
		}
		return template.Must(template.New(name).Parse(buf.String()))
	})
}
