package util

import (
	"fmt"
	"strconv"

	uuid58 "github.com/AlexanderMatveev/go-uuid-base58"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgtype"
)

func FormatSeconds(feconds float64) string {
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

func FormatUuid58(id uuid.UUID) string {
	short, _ := uuid58.ToBase58(id)

	return short
}

func ParseUuid58(base58Uuid string) pgtype.UUID {
	bytes, _ := uuid58.FromBase58(base58Uuid)

	return pgtype.UUID{Bytes: bytes, Valid: true}
}
