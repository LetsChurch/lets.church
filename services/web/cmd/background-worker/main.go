package main

import (
	"time"

	worker "github.com/contribsys/faktory_worker_go"
	"lets.church/cmd/background-worker/jobs"
	"lets.church/internal/util"
)

func main() {
	util.InitLogger()
	mgr := worker.NewManager()
	mgr.Register("SendEmail", jobs.SendEmail)
	mgr.Concurrency = 100

	// wait up to 25 seconds to let jobs in progress finish
	mgr.ShutdownTimeout = 25 * time.Second

	mgr.ProcessStrictPriorityQueues("background")
	mgr.Run()
}
