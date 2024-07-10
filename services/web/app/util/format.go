package util

import (
	"fmt"
	"strconv"
)

func FormatSeconds(feconds float32) string {
	seconds := int(feconds)
	hours := seconds / 3600
	minutes := (seconds % 3600) / 60
	remainingSeconds := seconds % 60

	var formattedHours string
	if hours > 0 {
		formattedHours = strconv.Itoa(hours) + ":"
	}

	var formattedMinutes string
	if hours > 0 {
		formattedMinutes = fmt.Sprintf("%02d:", minutes)
	} else {
		formattedMinutes = strconv.Itoa(minutes) + ":"
	}

	formattedSeconds := fmt.Sprintf("%02d", remainingSeconds)

	return formattedHours + formattedMinutes + formattedSeconds
}
