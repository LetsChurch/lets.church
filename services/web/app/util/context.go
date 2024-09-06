package util

type Flash struct {
	Level   string
	Title   string
	Message string
}

type AppContext struct {
	SessionId     *Uuid
	Flashes       []Flash
	Authenticated bool
	CsrfToken     string
}
