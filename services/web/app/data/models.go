// Code generated by sqlc. DO NOT EDIT.
// versions:
//   sqlc v1.26.0

package data

import (
	"database/sql/driver"
	"fmt"

	"github.com/jackc/pgx/v5/pgtype"
)

type AddressType string

const (
	AddressTypeMAILING AddressType = "MAILING"
	AddressTypeMEETING AddressType = "MEETING"
	AddressTypeOFFICE  AddressType = "OFFICE"
	AddressTypeOTHER   AddressType = "OTHER"
)

func (e *AddressType) Scan(src interface{}) error {
	switch s := src.(type) {
	case []byte:
		*e = AddressType(s)
	case string:
		*e = AddressType(s)
	default:
		return fmt.Errorf("unsupported scan type for AddressType: %T", src)
	}
	return nil
}

type NullAddressType struct {
	AddressType AddressType
	Valid       bool // Valid is true if AddressType is not NULL
}

// Scan implements the Scanner interface.
func (ns *NullAddressType) Scan(value interface{}) error {
	if value == nil {
		ns.AddressType, ns.Valid = "", false
		return nil
	}
	ns.Valid = true
	return ns.AddressType.Scan(value)
}

// Value implements the driver Valuer interface.
func (ns NullAddressType) Value() (driver.Value, error) {
	if !ns.Valid {
		return nil, nil
	}
	return string(ns.AddressType), nil
}

type AppUserRole string

const (
	AppUserRoleUSER  AppUserRole = "USER"
	AppUserRoleADMIN AppUserRole = "ADMIN"
)

func (e *AppUserRole) Scan(src interface{}) error {
	switch s := src.(type) {
	case []byte:
		*e = AppUserRole(s)
	case string:
		*e = AppUserRole(s)
	default:
		return fmt.Errorf("unsupported scan type for AppUserRole: %T", src)
	}
	return nil
}

type NullAppUserRole struct {
	AppUserRole AppUserRole
	Valid       bool // Valid is true if AppUserRole is not NULL
}

// Scan implements the Scanner interface.
func (ns *NullAppUserRole) Scan(value interface{}) error {
	if value == nil {
		ns.AppUserRole, ns.Valid = "", false
		return nil
	}
	ns.Valid = true
	return ns.AppUserRole.Scan(value)
}

// Value implements the driver Valuer interface.
func (ns NullAppUserRole) Value() (driver.Value, error) {
	if !ns.Valid {
		return nil, nil
	}
	return string(ns.AppUserRole), nil
}

type ChannelVisibility string

const (
	ChannelVisibilityPUBLIC   ChannelVisibility = "PUBLIC"
	ChannelVisibilityPRIVATE  ChannelVisibility = "PRIVATE"
	ChannelVisibilityUNLISTED ChannelVisibility = "UNLISTED"
)

func (e *ChannelVisibility) Scan(src interface{}) error {
	switch s := src.(type) {
	case []byte:
		*e = ChannelVisibility(s)
	case string:
		*e = ChannelVisibility(s)
	default:
		return fmt.Errorf("unsupported scan type for ChannelVisibility: %T", src)
	}
	return nil
}

type NullChannelVisibility struct {
	ChannelVisibility ChannelVisibility
	Valid             bool // Valid is true if ChannelVisibility is not NULL
}

// Scan implements the Scanner interface.
func (ns *NullChannelVisibility) Scan(value interface{}) error {
	if value == nil {
		ns.ChannelVisibility, ns.Valid = "", false
		return nil
	}
	ns.Valid = true
	return ns.ChannelVisibility.Scan(value)
}

// Value implements the driver Valuer interface.
func (ns NullChannelVisibility) Value() (driver.Value, error) {
	if !ns.Valid {
		return nil, nil
	}
	return string(ns.ChannelVisibility), nil
}

type OrganizationLeaderType string

const (
	OrganizationLeaderTypeELDER  OrganizationLeaderType = "ELDER"
	OrganizationLeaderTypeDEACON OrganizationLeaderType = "DEACON"
	OrganizationLeaderTypeOTHER  OrganizationLeaderType = "OTHER"
)

func (e *OrganizationLeaderType) Scan(src interface{}) error {
	switch s := src.(type) {
	case []byte:
		*e = OrganizationLeaderType(s)
	case string:
		*e = OrganizationLeaderType(s)
	default:
		return fmt.Errorf("unsupported scan type for OrganizationLeaderType: %T", src)
	}
	return nil
}

type NullOrganizationLeaderType struct {
	OrganizationLeaderType OrganizationLeaderType
	Valid                  bool // Valid is true if OrganizationLeaderType is not NULL
}

// Scan implements the Scanner interface.
func (ns *NullOrganizationLeaderType) Scan(value interface{}) error {
	if value == nil {
		ns.OrganizationLeaderType, ns.Valid = "", false
		return nil
	}
	ns.Valid = true
	return ns.OrganizationLeaderType.Scan(value)
}

// Value implements the driver Valuer interface.
func (ns NullOrganizationLeaderType) Value() (driver.Value, error) {
	if !ns.Valid {
		return nil, nil
	}
	return string(ns.OrganizationLeaderType), nil
}

type OrganizationTagCategory string

const (
	OrganizationTagCategoryDENOMINATION OrganizationTagCategory = "DENOMINATION"
	OrganizationTagCategoryDOCTRINE     OrganizationTagCategory = "DOCTRINE"
	OrganizationTagCategoryESCHATOLOGY  OrganizationTagCategory = "ESCHATOLOGY"
	OrganizationTagCategoryWORSHIP      OrganizationTagCategory = "WORSHIP"
	OrganizationTagCategoryCONFESSION   OrganizationTagCategory = "CONFESSION"
	OrganizationTagCategoryGOVERNMENT   OrganizationTagCategory = "GOVERNMENT"
	OrganizationTagCategoryOTHER        OrganizationTagCategory = "OTHER"
)

func (e *OrganizationTagCategory) Scan(src interface{}) error {
	switch s := src.(type) {
	case []byte:
		*e = OrganizationTagCategory(s)
	case string:
		*e = OrganizationTagCategory(s)
	default:
		return fmt.Errorf("unsupported scan type for OrganizationTagCategory: %T", src)
	}
	return nil
}

type NullOrganizationTagCategory struct {
	OrganizationTagCategory OrganizationTagCategory
	Valid                   bool // Valid is true if OrganizationTagCategory is not NULL
}

// Scan implements the Scanner interface.
func (ns *NullOrganizationTagCategory) Scan(value interface{}) error {
	if value == nil {
		ns.OrganizationTagCategory, ns.Valid = "", false
		return nil
	}
	ns.Valid = true
	return ns.OrganizationTagCategory.Scan(value)
}

// Value implements the driver Valuer interface.
func (ns NullOrganizationTagCategory) Value() (driver.Value, error) {
	if !ns.Valid {
		return nil, nil
	}
	return string(ns.OrganizationTagCategory), nil
}

type OrganizationType string

const (
	OrganizationTypeCHURCH   OrganizationType = "CHURCH"
	OrganizationTypeMINISTRY OrganizationType = "MINISTRY"
)

func (e *OrganizationType) Scan(src interface{}) error {
	switch s := src.(type) {
	case []byte:
		*e = OrganizationType(s)
	case string:
		*e = OrganizationType(s)
	default:
		return fmt.Errorf("unsupported scan type for OrganizationType: %T", src)
	}
	return nil
}

type NullOrganizationType struct {
	OrganizationType OrganizationType
	Valid            bool // Valid is true if OrganizationType is not NULL
}

// Scan implements the Scanner interface.
func (ns *NullOrganizationType) Scan(value interface{}) error {
	if value == nil {
		ns.OrganizationType, ns.Valid = "", false
		return nil
	}
	ns.Valid = true
	return ns.OrganizationType.Scan(value)
}

// Value implements the driver Valuer interface.
func (ns NullOrganizationType) Value() (driver.Value, error) {
	if !ns.Valid {
		return nil, nil
	}
	return string(ns.OrganizationType), nil
}

type Rating string

const (
	RatingLIKE    Rating = "LIKE"
	RatingDISLIKE Rating = "DISLIKE"
)

func (e *Rating) Scan(src interface{}) error {
	switch s := src.(type) {
	case []byte:
		*e = Rating(s)
	case string:
		*e = Rating(s)
	default:
		return fmt.Errorf("unsupported scan type for Rating: %T", src)
	}
	return nil
}

type NullRating struct {
	Rating Rating
	Valid  bool // Valid is true if Rating is not NULL
}

// Scan implements the Scanner interface.
func (ns *NullRating) Scan(value interface{}) error {
	if value == nil {
		ns.Rating, ns.Valid = "", false
		return nil
	}
	ns.Valid = true
	return ns.Rating.Scan(value)
}

// Value implements the driver Valuer interface.
func (ns NullRating) Value() (driver.Value, error) {
	if !ns.Valid {
		return nil, nil
	}
	return string(ns.Rating), nil
}

type TagColor string

const (
	TagColorGRAY   TagColor = "GRAY"
	TagColorRED    TagColor = "RED"
	TagColorYELLOW TagColor = "YELLOW"
	TagColorGREEN  TagColor = "GREEN"
	TagColorBLUE   TagColor = "BLUE"
	TagColorINDIGO TagColor = "INDIGO"
	TagColorPURPLE TagColor = "PURPLE"
	TagColorPINK   TagColor = "PINK"
)

func (e *TagColor) Scan(src interface{}) error {
	switch s := src.(type) {
	case []byte:
		*e = TagColor(s)
	case string:
		*e = TagColor(s)
	default:
		return fmt.Errorf("unsupported scan type for TagColor: %T", src)
	}
	return nil
}

type NullTagColor struct {
	TagColor TagColor
	Valid    bool // Valid is true if TagColor is not NULL
}

// Scan implements the Scanner interface.
func (ns *NullTagColor) Scan(value interface{}) error {
	if value == nil {
		ns.TagColor, ns.Valid = "", false
		return nil
	}
	ns.Valid = true
	return ns.TagColor.Scan(value)
}

// Value implements the driver Valuer interface.
func (ns NullTagColor) Value() (driver.Value, error) {
	if !ns.Valid {
		return nil, nil
	}
	return string(ns.TagColor), nil
}

type UploadLicense string

const (
	UploadLicenseSTANDARD     UploadLicense = "STANDARD"
	UploadLicensePUBLICDOMAIN UploadLicense = "PUBLIC_DOMAIN"
	UploadLicenseCCBY         UploadLicense = "CC_BY"
	UploadLicenseCCBYSA       UploadLicense = "CC_BY_SA"
	UploadLicenseCCBYNC       UploadLicense = "CC_BY_NC"
	UploadLicenseCCBYNCSA     UploadLicense = "CC_BY_NC_SA"
	UploadLicenseCCBYND       UploadLicense = "CC_BY_ND"
	UploadLicenseCCBYNCND     UploadLicense = "CC_BY_NC_ND"
	UploadLicenseCC0          UploadLicense = "CC0"
)

func (e *UploadLicense) Scan(src interface{}) error {
	switch s := src.(type) {
	case []byte:
		*e = UploadLicense(s)
	case string:
		*e = UploadLicense(s)
	default:
		return fmt.Errorf("unsupported scan type for UploadLicense: %T", src)
	}
	return nil
}

type NullUploadLicense struct {
	UploadLicense UploadLicense
	Valid         bool // Valid is true if UploadLicense is not NULL
}

// Scan implements the Scanner interface.
func (ns *NullUploadLicense) Scan(value interface{}) error {
	if value == nil {
		ns.UploadLicense, ns.Valid = "", false
		return nil
	}
	ns.Valid = true
	return ns.UploadLicense.Scan(value)
}

// Value implements the driver Valuer interface.
func (ns NullUploadLicense) Value() (driver.Value, error) {
	if !ns.Valid {
		return nil, nil
	}
	return string(ns.UploadLicense), nil
}

type UploadListType string

const (
	UploadListTypeSERIES   UploadListType = "SERIES"
	UploadListTypePLAYLIST UploadListType = "PLAYLIST"
)

func (e *UploadListType) Scan(src interface{}) error {
	switch s := src.(type) {
	case []byte:
		*e = UploadListType(s)
	case string:
		*e = UploadListType(s)
	default:
		return fmt.Errorf("unsupported scan type for UploadListType: %T", src)
	}
	return nil
}

type NullUploadListType struct {
	UploadListType UploadListType
	Valid          bool // Valid is true if UploadListType is not NULL
}

// Scan implements the Scanner interface.
func (ns *NullUploadListType) Scan(value interface{}) error {
	if value == nil {
		ns.UploadListType, ns.Valid = "", false
		return nil
	}
	ns.Valid = true
	return ns.UploadListType.Scan(value)
}

// Value implements the driver Valuer interface.
func (ns NullUploadListType) Value() (driver.Value, error) {
	if !ns.Valid {
		return nil, nil
	}
	return string(ns.UploadListType), nil
}

type UploadVariant string

const (
	UploadVariantVIDEO4K            UploadVariant = "VIDEO_4K"
	UploadVariantVIDEO4KDOWNLOAD    UploadVariant = "VIDEO_4K_DOWNLOAD"
	UploadVariantVIDEO1080P         UploadVariant = "VIDEO_1080P"
	UploadVariantVIDEO1080PDOWNLOAD UploadVariant = "VIDEO_1080P_DOWNLOAD"
	UploadVariantVIDEO720P          UploadVariant = "VIDEO_720P"
	UploadVariantVIDEO720PDOWNLOAD  UploadVariant = "VIDEO_720P_DOWNLOAD"
	UploadVariantVIDEO480P          UploadVariant = "VIDEO_480P"
	UploadVariantVIDEO480PDOWNLOAD  UploadVariant = "VIDEO_480P_DOWNLOAD"
	UploadVariantVIDEO360P          UploadVariant = "VIDEO_360P"
	UploadVariantVIDEO360PDOWNLOAD  UploadVariant = "VIDEO_360P_DOWNLOAD"
	UploadVariantAUDIO              UploadVariant = "AUDIO"
	UploadVariantAUDIODOWNLOAD      UploadVariant = "AUDIO_DOWNLOAD"
)

func (e *UploadVariant) Scan(src interface{}) error {
	switch s := src.(type) {
	case []byte:
		*e = UploadVariant(s)
	case string:
		*e = UploadVariant(s)
	default:
		return fmt.Errorf("unsupported scan type for UploadVariant: %T", src)
	}
	return nil
}

type NullUploadVariant struct {
	UploadVariant UploadVariant
	Valid         bool // Valid is true if UploadVariant is not NULL
}

// Scan implements the Scanner interface.
func (ns *NullUploadVariant) Scan(value interface{}) error {
	if value == nil {
		ns.UploadVariant, ns.Valid = "", false
		return nil
	}
	ns.Valid = true
	return ns.UploadVariant.Scan(value)
}

// Value implements the driver Valuer interface.
func (ns NullUploadVariant) Value() (driver.Value, error) {
	if !ns.Valid {
		return nil, nil
	}
	return string(ns.UploadVariant), nil
}

type UploadVisibility string

const (
	UploadVisibilityPUBLIC   UploadVisibility = "PUBLIC"
	UploadVisibilityPRIVATE  UploadVisibility = "PRIVATE"
	UploadVisibilityUNLISTED UploadVisibility = "UNLISTED"
)

func (e *UploadVisibility) Scan(src interface{}) error {
	switch s := src.(type) {
	case []byte:
		*e = UploadVisibility(s)
	case string:
		*e = UploadVisibility(s)
	default:
		return fmt.Errorf("unsupported scan type for UploadVisibility: %T", src)
	}
	return nil
}

type NullUploadVisibility struct {
	UploadVisibility UploadVisibility
	Valid            bool // Valid is true if UploadVisibility is not NULL
}

// Scan implements the Scanner interface.
func (ns *NullUploadVisibility) Scan(value interface{}) error {
	if value == nil {
		ns.UploadVisibility, ns.Valid = "", false
		return nil
	}
	ns.Valid = true
	return ns.UploadVisibility.Scan(value)
}

// Value implements the driver Valuer interface.
func (ns NullUploadVisibility) Value() (driver.Value, error) {
	if !ns.Valid {
		return nil, nil
	}
	return string(ns.UploadVisibility), nil
}

type AppSession struct {
	ID        pgtype.UUID
	AppUserID pgtype.UUID
	ExpiresAt pgtype.Timestamp
	CreatedAt pgtype.Timestamp
	UpdatedAt pgtype.Timestamp
	DeletedAt pgtype.Timestamp
}

type AppUser struct {
	ID             pgtype.UUID
	Username       interface{}
	Password       string
	FullName       pgtype.Text
	AvatarPath     pgtype.Text
	AvatarBlurhash pgtype.Text
	CreatedAt      pgtype.Timestamp
	UpdatedAt      pgtype.Timestamp
	DeletedAt      pgtype.Timestamp
	Role           AppUserRole
}

type AppUserEmail struct {
	ID         pgtype.UUID
	AppUserID  pgtype.UUID
	Email      interface{}
	Key        pgtype.UUID
	VerifiedAt pgtype.Timestamp
}

type Channel struct {
	ID                       pgtype.UUID
	Name                     string
	AvatarPath               pgtype.Text
	AvatarBlurhash           pgtype.Text
	Slug                     pgtype.Text
	Description              pgtype.Text
	CreatedAt                pgtype.Timestamp
	UpdatedAt                pgtype.Timestamp
	DefaultThumbnailBlurhash pgtype.Text
	DefaultThumbnailPath     pgtype.Text
	Visibility               ChannelVisibility
}

type ChannelMembership struct {
	ChannelID pgtype.UUID
	AppUserID pgtype.UUID
	IsAdmin   bool
	CanEdit   bool
	CanUpload bool
	CreatedAt pgtype.Timestamp
	UpdatedAt pgtype.Timestamp
}

type ChannelSubscription struct {
	AppUserID pgtype.UUID
	ChannelID pgtype.UUID
}

type NewsletterSubscription struct {
	ID         pgtype.UUID
	Email      interface{}
	Key        pgtype.UUID
	VerifiedAt pgtype.Timestamp
}

type Organization struct {
	ID                                           pgtype.UUID
	Name                                         string
	Slug                                         interface{}
	Description                                  pgtype.Text
	CreatedAt                                    pgtype.Timestamp
	UpdatedAt                                    pgtype.Timestamp
	Type                                         OrganizationType
	AvatarPath                                   pgtype.Text
	CoverPath                                    pgtype.Text
	PrimaryEmail                                 pgtype.Text
	PrimaryPhoneNumber                           pgtype.Text
	WebsiteUrl                                   pgtype.Text
	AutomaticallyApproveOrganizationAssociations bool
}

type OrganizationAddress struct {
	ID                  pgtype.UUID
	Country             pgtype.Text
	GeocodingJson       []byte
	Locality            pgtype.Text
	Name                pgtype.Text
	OrganizationID      pgtype.UUID
	PostOfficeBoxNumber pgtype.Text
	PostalCode          pgtype.Text
	Query               pgtype.Text
	Region              pgtype.Text
	StreetAddress       pgtype.Text
	Type                AddressType
	Latitude            pgtype.Float8
	Longitude           pgtype.Float8
}

type OrganizationChannelAssociation struct {
	OrganizationID  pgtype.UUID
	ChannelID       pgtype.UUID
	CreatedAt       pgtype.Timestamp
	UpdatedAt       pgtype.Timestamp
	OfficialChannel bool
}

type OrganizationLeader struct {
	ID             pgtype.UUID
	OrganizationID pgtype.UUID
	Type           OrganizationLeaderType
	Name           pgtype.Text
	Email          pgtype.Text
	PhoneNumber    pgtype.Text
}

type OrganizationMembership struct {
	OrganizationID pgtype.UUID
	AppUserID      pgtype.UUID
	IsAdmin        bool
	CanEdit        bool
	CreatedAt      pgtype.Timestamp
	UpdatedAt      pgtype.Timestamp
}

type OrganizationOrganizationAssociation struct {
	UpstreamOrganizationID   pgtype.UUID
	DownstreamOrganizationID pgtype.UUID
	UpstreamApproved         bool
	DownstreamApproved       bool
	CreatedAt                pgtype.Timestamp
	UpdatedAt                pgtype.Timestamp
}

type OrganizationTag struct {
	Slug         interface{}
	Label        string
	Description  pgtype.Text
	MoreInfoLink pgtype.Text
	Category     OrganizationTagCategory
	Color        TagColor
}

type OrganizationTagInstance struct {
	OrganizationID pgtype.UUID
	TagSlug        interface{}
}

type OrganizationTagSuggestion struct {
	ParentSlug      interface{}
	RecommendedSlug interface{}
}

type PrismaMigration struct {
	ID                string
	Checksum          string
	FinishedAt        pgtype.Timestamptz
	MigrationName     string
	Logs              pgtype.Text
	RolledBackAt      pgtype.Timestamptz
	StartedAt         pgtype.Timestamptz
	AppliedStepsCount int32
}

type TrackingSalt struct {
	ID        int32
	Salt      int32
	CreatedAt pgtype.Timestamp
}

type UploadList struct {
	ID        pgtype.UUID
	CreatedAt pgtype.Timestamp
	UpdatedAt pgtype.Timestamp
	Title     string
	AuthorID  pgtype.UUID
	ChannelID pgtype.UUID
	Type      UploadListType
}

type UploadListEntry struct {
	UploadListID   pgtype.UUID
	UploadRecordID pgtype.UUID
	Rank           string
}

type UploadRecord struct {
	ID                        pgtype.UUID
	Title                     pgtype.Text
	Description               pgtype.Text
	AppUserID                 pgtype.UUID
	License                   UploadLicense
	ChannelID                 pgtype.UUID
	Visibility                UploadVisibility
	UploadSizeBytes           pgtype.Int8
	UploadFinalized           bool
	UploadFinalizedByID       pgtype.UUID
	DefaultThumbnailPath      pgtype.Text
	LengthSeconds             pgtype.Float8
	DefaultThumbnailBlurhash  pgtype.Text
	CreatedAt                 pgtype.Timestamp
	UpdatedAt                 pgtype.Timestamp
	PublishedAt               pgtype.Timestamp
	TranscodingStartedAt      pgtype.Timestamp
	TranscodingFinishedAt     pgtype.Timestamp
	TranscodingProgress       float64
	TranscribingStartedAt     pgtype.Timestamp
	TranscribingFinishedAt    pgtype.Timestamp
	DeletedAt                 pgtype.Timestamp
	Variants                  []UploadVariant
	Score                     float64
	ScoreStaleAt              pgtype.Timestamp
	UserCommentsEnabled       bool
	DownloadsEnabled          bool
	FinalizedUploadKey        pgtype.Text
	OverrideThumbnailBlurhash pgtype.Text
	OverrideThumbnailPath     pgtype.Text
	ThumbnailCount            pgtype.Int4
	UploadFinalizedAt         pgtype.Timestamp
	Probe                     []byte
}

type UploadRecordDownloadSize struct {
	UploadRecordID pgtype.UUID
	Variant        UploadVariant
	SizeBytes      int64
}

type UploadUserComment struct {
	ID           pgtype.UUID
	CreatedAt    pgtype.Timestamp
	UpdatedAt    pgtype.Timestamp
	AuthorID     pgtype.UUID
	UploadID     pgtype.UUID
	ReplyingToID pgtype.UUID
	Text         string
	Score        float64
	ScoreStaleAt pgtype.Timestamp
}

type UploadUserCommentRating struct {
	AppUserID pgtype.UUID
	UploadID  pgtype.UUID
	Rating    Rating
	CreatedAt pgtype.Timestamp
}

type UploadUserRating struct {
	AppUserID pgtype.UUID
	UploadID  pgtype.UUID
	Rating    Rating
	CreatedAt pgtype.Timestamp
}

type UploadView struct {
	UploadRecordID pgtype.UUID
	ViewHash       int64
	AppUserID      pgtype.UUID
	CreatedAt      pgtype.Timestamp
	Count          int32
}

type UploadViewRange struct {
	ID             pgtype.UUID
	UploadRecordID pgtype.UUID
	ViewerHash     int64
	AppUserID      pgtype.UUID
	ViewTimestamp  pgtype.Timestamp
	Ranges         []byte
	TotalTime      float64
}
