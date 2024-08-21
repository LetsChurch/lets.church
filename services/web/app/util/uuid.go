package util

import (
	"fmt"
	"math/big"
	"strings"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgtype"
)

const base58Alphabet = "123456789abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ"

type Uuid [16]byte

func ParseUuid(id string) (Uuid, error) {
	if len(id) == 22 {
		alphabetLen := big.NewInt(int64(len(base58Alphabet)))
		x := big.NewInt(0)

		for _, char := range id {
			index := strings.IndexRune(base58Alphabet, char)
			if index == -1 {
				return Uuid([]byte{}), fmt.Errorf("invalid id character: %c", char)
			}
			x.Mul(x, alphabetLen)
			x.Add(x, big.NewInt(int64(index)))
		}

		padded := make([]byte, 16)
		bytes := x.Bytes()
		copy(padded[16-len(bytes):], bytes)
		return Uuid(padded), nil
	}

	bytes, err := uuid.Parse(id)

	return Uuid(bytes), err
}

func (id Uuid) Base58() string {
	alphabetLen := big.NewInt(int64(len(base58Alphabet)))
	zero := big.NewInt(0)
	x := new(big.Int).SetBytes(id[:])
	encoded := ""

	for x.Cmp(zero) > 0 {
		mod := new(big.Int)
		x.DivMod(x, alphabetLen, mod)
		encoded = string(base58Alphabet[mod.Int64()]) + encoded
	}

	if len(encoded) >= 22 {
		return encoded
	}

	padding := strings.Repeat(string(base58Alphabet[0]), 22-len(encoded))

	return padding + encoded
}

func (id Uuid) Canonical() string {
	return uuid.UUID(id).String()
}

func (id Uuid) Pg() pgtype.UUID {
	return pgtype.UUID{Bytes: id, Valid: true}
}
