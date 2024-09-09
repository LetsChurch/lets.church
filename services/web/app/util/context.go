package util

import "lets.church/web/app/data"

type Flash struct {
	Level   string
	Title   string
	Message string
}

type AppContext struct {
	Flashes       []Flash
	Authenticated bool
	CsrfToken     string
	User          *data.GetUserByIdRow
}
