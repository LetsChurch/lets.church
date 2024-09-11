--
-- PostgreSQL database dump
--

-- Dumped from database version 14.7
-- Dumped by pg_dump version 14.11 (Homebrew)

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: citext; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS citext WITH SCHEMA public;


--
-- Name: EXTENSION citext; Type: COMMENT; Schema: -; Owner: 
--

COMMENT ON EXTENSION citext IS 'data type for case-insensitive character strings';


--
-- Name: uuid-ossp; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA public;


--
-- Name: EXTENSION "uuid-ossp"; Type: COMMENT; Schema: -; Owner: 
--

COMMENT ON EXTENSION "uuid-ossp" IS 'generate universally unique identifiers (UUIDs)';


--
-- Name: TagColor; Type: TYPE; Schema: public; Owner: letschurch
--

CREATE TYPE public."TagColor" AS ENUM (
    'GRAY',
    'RED',
    'YELLOW',
    'GREEN',
    'BLUE',
    'INDIGO',
    'PURPLE',
    'PINK'
);


ALTER TYPE public."TagColor" OWNER TO letschurch;

--
-- Name: address_type; Type: TYPE; Schema: public; Owner: letschurch
--

CREATE TYPE public.address_type AS ENUM (
    'MAILING',
    'MEETING',
    'OFFICE',
    'OTHER'
);


ALTER TYPE public.address_type OWNER TO letschurch;

--
-- Name: app_user_role; Type: TYPE; Schema: public; Owner: letschurch
--

CREATE TYPE public.app_user_role AS ENUM (
    'USER',
    'ADMIN'
);


ALTER TYPE public.app_user_role OWNER TO letschurch;

--
-- Name: channel_visibility; Type: TYPE; Schema: public; Owner: letschurch
--

CREATE TYPE public.channel_visibility AS ENUM (
    'PUBLIC',
    'PRIVATE',
    'UNLISTED'
);


ALTER TYPE public.channel_visibility OWNER TO letschurch;

--
-- Name: organization_leader_type; Type: TYPE; Schema: public; Owner: letschurch
--

CREATE TYPE public.organization_leader_type AS ENUM (
    'ELDER',
    'DEACON',
    'OTHER'
);


ALTER TYPE public.organization_leader_type OWNER TO letschurch;

--
-- Name: organization_tag_category; Type: TYPE; Schema: public; Owner: letschurch
--

CREATE TYPE public.organization_tag_category AS ENUM (
    'DENOMINATION',
    'DOCTRINE',
    'ESCHATOLOGY',
    'WORSHIP',
    'CONFESSION',
    'GOVERNMENT',
    'OTHER'
);


ALTER TYPE public.organization_tag_category OWNER TO letschurch;

--
-- Name: organization_type; Type: TYPE; Schema: public; Owner: letschurch
--

CREATE TYPE public.organization_type AS ENUM (
    'CHURCH',
    'MINISTRY'
);


ALTER TYPE public.organization_type OWNER TO letschurch;

--
-- Name: rating; Type: TYPE; Schema: public; Owner: letschurch
--

CREATE TYPE public.rating AS ENUM (
    'LIKE',
    'DISLIKE'
);


ALTER TYPE public.rating OWNER TO letschurch;

--
-- Name: upload_license; Type: TYPE; Schema: public; Owner: letschurch
--

CREATE TYPE public.upload_license AS ENUM (
    'STANDARD',
    'PUBLIC_DOMAIN',
    'CC_BY',
    'CC_BY_SA',
    'CC_BY_NC',
    'CC_BY_NC_SA',
    'CC_BY_ND',
    'CC_BY_NC_ND',
    'CC0'
);


ALTER TYPE public.upload_license OWNER TO letschurch;

--
-- Name: upload_list_type; Type: TYPE; Schema: public; Owner: letschurch
--

CREATE TYPE public.upload_list_type AS ENUM (
    'SERIES',
    'PLAYLIST'
);


ALTER TYPE public.upload_list_type OWNER TO letschurch;

--
-- Name: upload_variant; Type: TYPE; Schema: public; Owner: letschurch
--

CREATE TYPE public.upload_variant AS ENUM (
    'VIDEO_4K',
    'VIDEO_4K_DOWNLOAD',
    'VIDEO_1080P',
    'VIDEO_1080P_DOWNLOAD',
    'VIDEO_720P',
    'VIDEO_720P_DOWNLOAD',
    'VIDEO_480P',
    'VIDEO_480P_DOWNLOAD',
    'VIDEO_360P',
    'VIDEO_360P_DOWNLOAD',
    'AUDIO',
    'AUDIO_DOWNLOAD'
);


ALTER TYPE public.upload_variant OWNER TO letschurch;

--
-- Name: upload_visibility; Type: TYPE; Schema: public; Owner: letschurch
--

CREATE TYPE public.upload_visibility AS ENUM (
    'PUBLIC',
    'PRIVATE',
    'UNLISTED'
);


ALTER TYPE public.upload_visibility OWNER TO letschurch;

SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: _prisma_migrations; Type: TABLE; Schema: public; Owner: letschurch
--

CREATE TABLE public._prisma_migrations (
    id character varying(36) NOT NULL,
    checksum character varying(64) NOT NULL,
    finished_at timestamp with time zone,
    migration_name character varying(255) NOT NULL,
    logs text,
    rolled_back_at timestamp with time zone,
    started_at timestamp with time zone DEFAULT now() NOT NULL,
    applied_steps_count integer DEFAULT 0 NOT NULL
);


ALTER TABLE public._prisma_migrations OWNER TO letschurch;

--
-- Name: app_session; Type: TABLE; Schema: public; Owner: letschurch
--

CREATE TABLE public.app_session (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    app_user_id uuid NOT NULL,
    expires_at timestamp(3) without time zone DEFAULT (now() + '14 days'::interval) NOT NULL,
    created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(3) without time zone NOT NULL,
    deleted_at timestamp(3) without time zone
);


ALTER TABLE public.app_session OWNER TO letschurch;

--
-- Name: app_user; Type: TABLE; Schema: public; Owner: letschurch
--

CREATE TABLE public.app_user (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    username public.citext NOT NULL,
    password text NOT NULL,
    full_name character varying(100),
    avatar_path character varying(255),
    avatar_blurhash character varying(255),
    created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(3) without time zone NOT NULL,
    deleted_at timestamp(3) without time zone,
    role public.app_user_role DEFAULT 'USER'::public.app_user_role NOT NULL
);


ALTER TABLE public.app_user OWNER TO letschurch;

--
-- Name: app_user_email; Type: TABLE; Schema: public; Owner: letschurch
--

CREATE TABLE public.app_user_email (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    app_user_id uuid NOT NULL,
    email public.citext NOT NULL,
    key uuid DEFAULT gen_random_uuid() NOT NULL,
    "verifiedAt" timestamp(3) without time zone
);


ALTER TABLE public.app_user_email OWNER TO letschurch;

--
-- Name: channel; Type: TABLE; Schema: public; Owner: letschurch
--

CREATE TABLE public.channel (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    avatar_path character varying(255),
    avatar_blurhash character varying(255),
    slug public.citext NOT NULL,
    description text,
    created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(3) without time zone NOT NULL,
    default_thumbnail_blurhash character varying(255),
    default_thumbnail_path character varying(255),
    visibility public.channel_visibility DEFAULT 'PUBLIC'::public.channel_visibility NOT NULL
);


ALTER TABLE public.channel OWNER TO letschurch;

--
-- Name: channel_membership; Type: TABLE; Schema: public; Owner: letschurch
--

CREATE TABLE public.channel_membership (
    channel_id uuid NOT NULL,
    app_user_id uuid NOT NULL,
    is_admin boolean DEFAULT false NOT NULL,
    can_edit boolean DEFAULT false NOT NULL,
    can_upload boolean DEFAULT false NOT NULL,
    created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(3) without time zone NOT NULL
);


ALTER TABLE public.channel_membership OWNER TO letschurch;

--
-- Name: channel_subscription; Type: TABLE; Schema: public; Owner: letschurch
--

CREATE TABLE public.channel_subscription (
    app_user_id uuid NOT NULL,
    channel_id uuid NOT NULL
);


ALTER TABLE public.channel_subscription OWNER TO letschurch;

--
-- Name: newsletter_subscription; Type: TABLE; Schema: public; Owner: letschurch
--

CREATE TABLE public.newsletter_subscription (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    email public.citext NOT NULL,
    key uuid DEFAULT gen_random_uuid() NOT NULL,
    "verifiedAt" timestamp(3) without time zone
);


ALTER TABLE public.newsletter_subscription OWNER TO letschurch;

--
-- Name: organization; Type: TABLE; Schema: public; Owner: letschurch
--

CREATE TABLE public.organization (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    slug public.citext NOT NULL,
    description text,
    created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(3) without time zone NOT NULL,
    type public.organization_type DEFAULT 'MINISTRY'::public.organization_type NOT NULL,
    avatar_path text,
    cover_path text,
    primary_email text,
    primary_phone_number text,
    website_url text,
    automatically_approve_organization_associations boolean DEFAULT false NOT NULL
);


ALTER TABLE public.organization OWNER TO letschurch;

--
-- Name: organization_address; Type: TABLE; Schema: public; Owner: letschurch
--

CREATE TABLE public.organization_address (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    country text,
    geocoding_json jsonb,
    locality text,
    name text,
    organization_id uuid NOT NULL,
    post_office_box_number text,
    postal_code text,
    query text,
    region text,
    street_address text,
    type public.address_type NOT NULL,
    latitude double precision,
    longitude double precision
);


ALTER TABLE public.organization_address OWNER TO letschurch;

--
-- Name: organization_channel_association; Type: TABLE; Schema: public; Owner: letschurch
--

CREATE TABLE public.organization_channel_association (
    organization_id uuid NOT NULL,
    channel_id uuid NOT NULL,
    created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(3) without time zone NOT NULL,
    "officialChannel" boolean DEFAULT false NOT NULL
);


ALTER TABLE public.organization_channel_association OWNER TO letschurch;

--
-- Name: organization_leader; Type: TABLE; Schema: public; Owner: letschurch
--

CREATE TABLE public.organization_leader (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    type public.organization_leader_type NOT NULL,
    name text,
    email text,
    phone_number text
);


ALTER TABLE public.organization_leader OWNER TO letschurch;

--
-- Name: organization_membership; Type: TABLE; Schema: public; Owner: letschurch
--

CREATE TABLE public.organization_membership (
    organization_id uuid NOT NULL,
    app_user_id uuid NOT NULL,
    is_admin boolean DEFAULT false NOT NULL,
    can_edit boolean DEFAULT false NOT NULL,
    created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(3) without time zone NOT NULL
);


ALTER TABLE public.organization_membership OWNER TO letschurch;

--
-- Name: organization_organization_association; Type: TABLE; Schema: public; Owner: letschurch
--

CREATE TABLE public.organization_organization_association (
    upstream_organization_id uuid NOT NULL,
    downstream_organization_id uuid NOT NULL,
    upstream_approved boolean DEFAULT false NOT NULL,
    downstream_approved boolean DEFAULT false NOT NULL,
    created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(3) without time zone NOT NULL
);


ALTER TABLE public.organization_organization_association OWNER TO letschurch;

--
-- Name: organization_tag; Type: TABLE; Schema: public; Owner: letschurch
--

CREATE TABLE public.organization_tag (
    slug public.citext NOT NULL,
    label text NOT NULL,
    description text,
    more_info_link text,
    category public.organization_tag_category NOT NULL,
    color public."TagColor" DEFAULT 'GRAY'::public."TagColor" NOT NULL
);


ALTER TABLE public.organization_tag OWNER TO letschurch;

--
-- Name: organization_tag_instance; Type: TABLE; Schema: public; Owner: letschurch
--

CREATE TABLE public.organization_tag_instance (
    organization_id uuid NOT NULL,
    tag_slug public.citext NOT NULL
);


ALTER TABLE public.organization_tag_instance OWNER TO letschurch;

--
-- Name: organization_tag_suggestion; Type: TABLE; Schema: public; Owner: letschurch
--

CREATE TABLE public.organization_tag_suggestion (
    parent_slug public.citext NOT NULL,
    recommended_slug public.citext NOT NULL
);


ALTER TABLE public.organization_tag_suggestion OWNER TO letschurch;

--
-- Name: tracking_salt; Type: TABLE; Schema: public; Owner: letschurch
--

CREATE TABLE public.tracking_salt (
    id integer NOT NULL,
    salt integer NOT NULL,
    created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


ALTER TABLE public.tracking_salt OWNER TO letschurch;

--
-- Name: tracking_salt_id_seq; Type: SEQUENCE; Schema: public; Owner: letschurch
--

CREATE SEQUENCE public.tracking_salt_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE public.tracking_salt_id_seq OWNER TO letschurch;

--
-- Name: tracking_salt_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: letschurch
--

ALTER SEQUENCE public.tracking_salt_id_seq OWNED BY public.tracking_salt.id;


--
-- Name: upload_list; Type: TABLE; Schema: public; Owner: letschurch
--

CREATE TABLE public.upload_list (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(3) without time zone NOT NULL,
    title text NOT NULL,
    author_id uuid NOT NULL,
    channel_id uuid,
    type public.upload_list_type NOT NULL
);


ALTER TABLE public.upload_list OWNER TO letschurch;

--
-- Name: upload_list_entry; Type: TABLE; Schema: public; Owner: letschurch
--

CREATE TABLE public.upload_list_entry (
    upload_list_id uuid NOT NULL,
    upload_record_id uuid NOT NULL,
    rank character varying(12) NOT NULL
);


ALTER TABLE public.upload_list_entry OWNER TO letschurch;

--
-- Name: upload_record; Type: TABLE; Schema: public; Owner: letschurch
--

CREATE TABLE public.upload_record (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    title text,
    description text,
    app_user_id uuid NOT NULL,
    license public.upload_license NOT NULL,
    channel_id uuid NOT NULL,
    visibility public.upload_visibility NOT NULL,
    upload_size_bytes bigint,
    upload_finalized boolean DEFAULT false NOT NULL,
    upload_finalized_by_id uuid,
    default_thumbnail_path text,
    length_seconds double precision,
    default_thumbnail_blurhash text,
    created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(3) without time zone NOT NULL,
    published_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    transcoding_started_at timestamp(3) without time zone,
    transcoding_finished_at timestamp(3) without time zone,
    transcoding_progress double precision DEFAULT 0 NOT NULL,
    transcribing_started_at timestamp(3) without time zone,
    transcribing_finished_at timestamp(3) without time zone,
    deleted_at timestamp(3) without time zone,
    variants public.upload_variant[],
    score double precision DEFAULT 0 NOT NULL,
    score_stale_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP,
    user_comments_enabled boolean DEFAULT true NOT NULL,
    downloads_enabled boolean DEFAULT true NOT NULL,
    finalized_upload_key text,
    override_thumbnail_blurhash text,
    override_thumbnail_path text,
    thumbnail_count integer,
    upload_finalized_at timestamp(3) without time zone,
    probe jsonb
);


ALTER TABLE public.upload_record OWNER TO letschurch;

--
-- Name: upload_record_download_size; Type: TABLE; Schema: public; Owner: letschurch
--

CREATE TABLE public.upload_record_download_size (
    upload_record_id uuid NOT NULL,
    variant public.upload_variant NOT NULL,
    size_bytes bigint NOT NULL
);


ALTER TABLE public.upload_record_download_size OWNER TO letschurch;

--
-- Name: upload_user_comment; Type: TABLE; Schema: public; Owner: letschurch
--

CREATE TABLE public.upload_user_comment (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(3) without time zone NOT NULL,
    author_id uuid NOT NULL,
    upload_id uuid NOT NULL,
    replying_to_id uuid,
    text text NOT NULL,
    score double precision DEFAULT 0 NOT NULL,
    score_stale_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.upload_user_comment OWNER TO letschurch;

--
-- Name: upload_user_comment_rating; Type: TABLE; Schema: public; Owner: letschurch
--

CREATE TABLE public.upload_user_comment_rating (
    app_user_id uuid NOT NULL,
    upload_id uuid NOT NULL,
    rating public.rating NOT NULL,
    created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


ALTER TABLE public.upload_user_comment_rating OWNER TO letschurch;

--
-- Name: upload_user_rating; Type: TABLE; Schema: public; Owner: letschurch
--

CREATE TABLE public.upload_user_rating (
    app_user_id uuid NOT NULL,
    upload_id uuid NOT NULL,
    rating public.rating NOT NULL,
    created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


ALTER TABLE public.upload_user_rating OWNER TO letschurch;

--
-- Name: upload_view; Type: TABLE; Schema: public; Owner: letschurch
--

CREATE TABLE public.upload_view (
    upload_record_id uuid NOT NULL,
    view_hash bigint NOT NULL,
    app_user_id uuid,
    created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    count integer DEFAULT 1 NOT NULL
);


ALTER TABLE public.upload_view OWNER TO letschurch;

--
-- Name: upload_view_ranges; Type: TABLE; Schema: public; Owner: letschurch
--

CREATE TABLE public.upload_view_ranges (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    upload_record_id uuid NOT NULL,
    viewer_hash bigint NOT NULL,
    app_user_id uuid,
    view_timestamp timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    ranges jsonb DEFAULT '[]'::jsonb NOT NULL,
    total_time double precision NOT NULL
);


ALTER TABLE public.upload_view_ranges OWNER TO letschurch;

--
-- Name: tracking_salt id; Type: DEFAULT; Schema: public; Owner: letschurch
--

ALTER TABLE ONLY public.tracking_salt ALTER COLUMN id SET DEFAULT nextval('public.tracking_salt_id_seq'::regclass);


--
-- Name: _prisma_migrations _prisma_migrations_pkey; Type: CONSTRAINT; Schema: public; Owner: letschurch
--

ALTER TABLE ONLY public._prisma_migrations
    ADD CONSTRAINT _prisma_migrations_pkey PRIMARY KEY (id);


--
-- Name: app_session app_session_pkey; Type: CONSTRAINT; Schema: public; Owner: letschurch
--

ALTER TABLE ONLY public.app_session
    ADD CONSTRAINT app_session_pkey PRIMARY KEY (id);


--
-- Name: app_user_email app_user_email_pkey; Type: CONSTRAINT; Schema: public; Owner: letschurch
--

ALTER TABLE ONLY public.app_user_email
    ADD CONSTRAINT app_user_email_pkey PRIMARY KEY (id);


--
-- Name: app_user app_user_pkey; Type: CONSTRAINT; Schema: public; Owner: letschurch
--

ALTER TABLE ONLY public.app_user
    ADD CONSTRAINT app_user_pkey PRIMARY KEY (id);


--
-- Name: channel_membership channel_membership_pkey; Type: CONSTRAINT; Schema: public; Owner: letschurch
--

ALTER TABLE ONLY public.channel_membership
    ADD CONSTRAINT channel_membership_pkey PRIMARY KEY (channel_id, app_user_id);


--
-- Name: channel channel_pkey; Type: CONSTRAINT; Schema: public; Owner: letschurch
--

ALTER TABLE ONLY public.channel
    ADD CONSTRAINT channel_pkey PRIMARY KEY (id);


--
-- Name: channel_subscription channel_subscription_pkey; Type: CONSTRAINT; Schema: public; Owner: letschurch
--

ALTER TABLE ONLY public.channel_subscription
    ADD CONSTRAINT channel_subscription_pkey PRIMARY KEY (app_user_id, channel_id);


--
-- Name: newsletter_subscription newsletter_subscription_pkey; Type: CONSTRAINT; Schema: public; Owner: letschurch
--

ALTER TABLE ONLY public.newsletter_subscription
    ADD CONSTRAINT newsletter_subscription_pkey PRIMARY KEY (id);


--
-- Name: organization_address organization_address_pkey; Type: CONSTRAINT; Schema: public; Owner: letschurch
--

ALTER TABLE ONLY public.organization_address
    ADD CONSTRAINT organization_address_pkey PRIMARY KEY (id);


--
-- Name: organization_channel_association organization_channel_association_pkey; Type: CONSTRAINT; Schema: public; Owner: letschurch
--

ALTER TABLE ONLY public.organization_channel_association
    ADD CONSTRAINT organization_channel_association_pkey PRIMARY KEY (organization_id, channel_id);


--
-- Name: organization_leader organization_leader_pkey; Type: CONSTRAINT; Schema: public; Owner: letschurch
--

ALTER TABLE ONLY public.organization_leader
    ADD CONSTRAINT organization_leader_pkey PRIMARY KEY (id);


--
-- Name: organization_membership organization_membership_pkey; Type: CONSTRAINT; Schema: public; Owner: letschurch
--

ALTER TABLE ONLY public.organization_membership
    ADD CONSTRAINT organization_membership_pkey PRIMARY KEY (organization_id, app_user_id);


--
-- Name: organization_organization_association organization_organization_association_pkey; Type: CONSTRAINT; Schema: public; Owner: letschurch
--

ALTER TABLE ONLY public.organization_organization_association
    ADD CONSTRAINT organization_organization_association_pkey PRIMARY KEY (upstream_organization_id, downstream_organization_id);


--
-- Name: organization organization_pkey; Type: CONSTRAINT; Schema: public; Owner: letschurch
--

ALTER TABLE ONLY public.organization
    ADD CONSTRAINT organization_pkey PRIMARY KEY (id);


--
-- Name: organization_tag_instance organization_tag_instance_pkey; Type: CONSTRAINT; Schema: public; Owner: letschurch
--

ALTER TABLE ONLY public.organization_tag_instance
    ADD CONSTRAINT organization_tag_instance_pkey PRIMARY KEY (organization_id, tag_slug);


--
-- Name: organization_tag_suggestion organization_tag_suggestion_pkey; Type: CONSTRAINT; Schema: public; Owner: letschurch
--

ALTER TABLE ONLY public.organization_tag_suggestion
    ADD CONSTRAINT organization_tag_suggestion_pkey PRIMARY KEY (parent_slug, recommended_slug);


--
-- Name: tracking_salt tracking_salt_pkey; Type: CONSTRAINT; Schema: public; Owner: letschurch
--

ALTER TABLE ONLY public.tracking_salt
    ADD CONSTRAINT tracking_salt_pkey PRIMARY KEY (id);


--
-- Name: upload_list_entry upload_list_entry_pkey; Type: CONSTRAINT; Schema: public; Owner: letschurch
--

ALTER TABLE ONLY public.upload_list_entry
    ADD CONSTRAINT upload_list_entry_pkey PRIMARY KEY (upload_list_id, rank);


--
-- Name: upload_list upload_list_pkey; Type: CONSTRAINT; Schema: public; Owner: letschurch
--

ALTER TABLE ONLY public.upload_list
    ADD CONSTRAINT upload_list_pkey PRIMARY KEY (id);


--
-- Name: upload_record upload_record_pkey; Type: CONSTRAINT; Schema: public; Owner: letschurch
--

ALTER TABLE ONLY public.upload_record
    ADD CONSTRAINT upload_record_pkey PRIMARY KEY (id);


--
-- Name: upload_user_comment upload_user_comment_pkey; Type: CONSTRAINT; Schema: public; Owner: letschurch
--

ALTER TABLE ONLY public.upload_user_comment
    ADD CONSTRAINT upload_user_comment_pkey PRIMARY KEY (id);


--
-- Name: upload_user_comment_rating upload_user_comment_rating_pkey; Type: CONSTRAINT; Schema: public; Owner: letschurch
--

ALTER TABLE ONLY public.upload_user_comment_rating
    ADD CONSTRAINT upload_user_comment_rating_pkey PRIMARY KEY (app_user_id, upload_id);


--
-- Name: upload_user_rating upload_user_rating_pkey; Type: CONSTRAINT; Schema: public; Owner: letschurch
--

ALTER TABLE ONLY public.upload_user_rating
    ADD CONSTRAINT upload_user_rating_pkey PRIMARY KEY (app_user_id, upload_id);


--
-- Name: upload_view upload_view_pkey; Type: CONSTRAINT; Schema: public; Owner: letschurch
--

ALTER TABLE ONLY public.upload_view
    ADD CONSTRAINT upload_view_pkey PRIMARY KEY (upload_record_id, view_hash);


--
-- Name: upload_view_ranges upload_view_ranges_pkey; Type: CONSTRAINT; Schema: public; Owner: letschurch
--

ALTER TABLE ONLY public.upload_view_ranges
    ADD CONSTRAINT upload_view_ranges_pkey PRIMARY KEY (id);


--
-- Name: app_user_email_email_key; Type: INDEX; Schema: public; Owner: letschurch
--

CREATE UNIQUE INDEX app_user_email_email_key ON public.app_user_email USING btree (email);


--
-- Name: app_user_username_key; Type: INDEX; Schema: public; Owner: letschurch
--

CREATE UNIQUE INDEX app_user_username_key ON public.app_user USING btree (username);


--
-- Name: channel_slug_key; Type: INDEX; Schema: public; Owner: letschurch
--

CREATE UNIQUE INDEX channel_slug_key ON public.channel USING btree (slug);


--
-- Name: newsletter_subscription_email_key; Type: INDEX; Schema: public; Owner: letschurch
--

CREATE UNIQUE INDEX newsletter_subscription_email_key ON public.newsletter_subscription USING btree (email);


--
-- Name: organization_slug_key; Type: INDEX; Schema: public; Owner: letschurch
--

CREATE UNIQUE INDEX organization_slug_key ON public.organization USING btree (slug);


--
-- Name: organization_tag_slug_key; Type: INDEX; Schema: public; Owner: letschurch
--

CREATE UNIQUE INDEX organization_tag_slug_key ON public.organization_tag USING btree (slug);


--
-- Name: upload_list_created_at_id_key; Type: INDEX; Schema: public; Owner: letschurch
--

CREATE UNIQUE INDEX upload_list_created_at_id_key ON public.upload_list USING btree (created_at, id);


--
-- Name: upload_list_entry_upload_list_id_upload_record_id_key; Type: INDEX; Schema: public; Owner: letschurch
--

CREATE UNIQUE INDEX upload_list_entry_upload_list_id_upload_record_id_key ON public.upload_list_entry USING btree (upload_list_id, upload_record_id);


--
-- Name: upload_record_created_at_id_idx; Type: INDEX; Schema: public; Owner: letschurch
--

CREATE INDEX upload_record_created_at_id_idx ON public.upload_record USING btree (created_at, id);


--
-- Name: upload_record_download_size_upload_record_id_variant_key; Type: INDEX; Schema: public; Owner: letschurch
--

CREATE UNIQUE INDEX upload_record_download_size_upload_record_id_variant_key ON public.upload_record_download_size USING btree (upload_record_id, variant);


--
-- Name: upload_record_score_idx; Type: INDEX; Schema: public; Owner: letschurch
--

CREATE INDEX upload_record_score_idx ON public.upload_record USING btree (score);


--
-- Name: upload_record_score_stale_at_idx; Type: INDEX; Schema: public; Owner: letschurch
--

CREATE INDEX upload_record_score_stale_at_idx ON public.upload_record USING btree (score_stale_at);


--
-- Name: upload_user_comment_rating_app_user_id_rating_idx; Type: INDEX; Schema: public; Owner: letschurch
--

CREATE INDEX upload_user_comment_rating_app_user_id_rating_idx ON public.upload_user_comment_rating USING btree (app_user_id, rating);


--
-- Name: upload_user_comment_rating_upload_id_rating_idx; Type: INDEX; Schema: public; Owner: letschurch
--

CREATE INDEX upload_user_comment_rating_upload_id_rating_idx ON public.upload_user_comment_rating USING btree (upload_id, rating);


--
-- Name: upload_user_comment_replying_to_id_idx; Type: INDEX; Schema: public; Owner: letschurch
--

CREATE INDEX upload_user_comment_replying_to_id_idx ON public.upload_user_comment USING btree (replying_to_id);


--
-- Name: upload_user_comment_score_idx; Type: INDEX; Schema: public; Owner: letschurch
--

CREATE INDEX upload_user_comment_score_idx ON public.upload_user_comment USING btree (score);


--
-- Name: upload_user_comment_score_stale_at_idx; Type: INDEX; Schema: public; Owner: letschurch
--

CREATE INDEX upload_user_comment_score_stale_at_idx ON public.upload_user_comment USING btree (score_stale_at);


--
-- Name: upload_user_rating_app_user_id_rating_idx; Type: INDEX; Schema: public; Owner: letschurch
--

CREATE INDEX upload_user_rating_app_user_id_rating_idx ON public.upload_user_rating USING btree (app_user_id, rating);


--
-- Name: upload_user_rating_upload_id_rating_idx; Type: INDEX; Schema: public; Owner: letschurch
--

CREATE INDEX upload_user_rating_upload_id_rating_idx ON public.upload_user_rating USING btree (upload_id, rating);


--
-- Name: upload_view_app_user_id_upload_record_id_idx; Type: INDEX; Schema: public; Owner: letschurch
--

CREATE INDEX upload_view_app_user_id_upload_record_id_idx ON public.upload_view USING btree (app_user_id, upload_record_id);


--
-- Name: upload_view_created_at_idx; Type: INDEX; Schema: public; Owner: letschurch
--

CREATE INDEX upload_view_created_at_idx ON public.upload_view USING btree (created_at);


--
-- Name: upload_view_ranges_upload_record_id_viewer_hash_idx; Type: INDEX; Schema: public; Owner: letschurch
--

CREATE INDEX upload_view_ranges_upload_record_id_viewer_hash_idx ON public.upload_view_ranges USING btree (upload_record_id, viewer_hash);


--
-- Name: upload_view_ranges_view_timestamp_idx; Type: INDEX; Schema: public; Owner: letschurch
--

CREATE INDEX upload_view_ranges_view_timestamp_idx ON public.upload_view_ranges USING btree (view_timestamp);


--
-- Name: app_session app_session_app_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: letschurch
--

ALTER TABLE ONLY public.app_session
    ADD CONSTRAINT app_session_app_user_id_fkey FOREIGN KEY (app_user_id) REFERENCES public.app_user(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: app_user_email app_user_email_app_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: letschurch
--

ALTER TABLE ONLY public.app_user_email
    ADD CONSTRAINT app_user_email_app_user_id_fkey FOREIGN KEY (app_user_id) REFERENCES public.app_user(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: channel_membership channel_membership_app_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: letschurch
--

ALTER TABLE ONLY public.channel_membership
    ADD CONSTRAINT channel_membership_app_user_id_fkey FOREIGN KEY (app_user_id) REFERENCES public.app_user(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: channel_membership channel_membership_channel_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: letschurch
--

ALTER TABLE ONLY public.channel_membership
    ADD CONSTRAINT channel_membership_channel_id_fkey FOREIGN KEY (channel_id) REFERENCES public.channel(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: channel_subscription channel_subscription_app_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: letschurch
--

ALTER TABLE ONLY public.channel_subscription
    ADD CONSTRAINT channel_subscription_app_user_id_fkey FOREIGN KEY (app_user_id) REFERENCES public.app_user(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: channel_subscription channel_subscription_channel_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: letschurch
--

ALTER TABLE ONLY public.channel_subscription
    ADD CONSTRAINT channel_subscription_channel_id_fkey FOREIGN KEY (channel_id) REFERENCES public.channel(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: organization_address organization_address_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: letschurch
--

ALTER TABLE ONLY public.organization_address
    ADD CONSTRAINT organization_address_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organization(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: organization_channel_association organization_channel_association_channel_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: letschurch
--

ALTER TABLE ONLY public.organization_channel_association
    ADD CONSTRAINT organization_channel_association_channel_id_fkey FOREIGN KEY (channel_id) REFERENCES public.channel(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: organization_channel_association organization_channel_association_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: letschurch
--

ALTER TABLE ONLY public.organization_channel_association
    ADD CONSTRAINT organization_channel_association_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organization(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: organization_leader organization_leader_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: letschurch
--

ALTER TABLE ONLY public.organization_leader
    ADD CONSTRAINT organization_leader_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organization(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: organization_membership organization_membership_app_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: letschurch
--

ALTER TABLE ONLY public.organization_membership
    ADD CONSTRAINT organization_membership_app_user_id_fkey FOREIGN KEY (app_user_id) REFERENCES public.app_user(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: organization_membership organization_membership_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: letschurch
--

ALTER TABLE ONLY public.organization_membership
    ADD CONSTRAINT organization_membership_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organization(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: organization_organization_association organization_organization_association_downstream_organizat_fkey; Type: FK CONSTRAINT; Schema: public; Owner: letschurch
--

ALTER TABLE ONLY public.organization_organization_association
    ADD CONSTRAINT organization_organization_association_downstream_organizat_fkey FOREIGN KEY (downstream_organization_id) REFERENCES public.organization(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: organization_organization_association organization_organization_association_upstream_organizatio_fkey; Type: FK CONSTRAINT; Schema: public; Owner: letschurch
--

ALTER TABLE ONLY public.organization_organization_association
    ADD CONSTRAINT organization_organization_association_upstream_organizatio_fkey FOREIGN KEY (upstream_organization_id) REFERENCES public.organization(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: organization_tag_instance organization_tag_instance_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: letschurch
--

ALTER TABLE ONLY public.organization_tag_instance
    ADD CONSTRAINT organization_tag_instance_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organization(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: organization_tag_instance organization_tag_instance_tag_slug_fkey; Type: FK CONSTRAINT; Schema: public; Owner: letschurch
--

ALTER TABLE ONLY public.organization_tag_instance
    ADD CONSTRAINT organization_tag_instance_tag_slug_fkey FOREIGN KEY (tag_slug) REFERENCES public.organization_tag(slug) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: organization_tag_suggestion organization_tag_suggestion_parent_slug_fkey; Type: FK CONSTRAINT; Schema: public; Owner: letschurch
--

ALTER TABLE ONLY public.organization_tag_suggestion
    ADD CONSTRAINT organization_tag_suggestion_parent_slug_fkey FOREIGN KEY (parent_slug) REFERENCES public.organization_tag(slug) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: organization_tag_suggestion organization_tag_suggestion_recommended_slug_fkey; Type: FK CONSTRAINT; Schema: public; Owner: letschurch
--

ALTER TABLE ONLY public.organization_tag_suggestion
    ADD CONSTRAINT organization_tag_suggestion_recommended_slug_fkey FOREIGN KEY (recommended_slug) REFERENCES public.organization_tag(slug) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: upload_list upload_list_author_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: letschurch
--

ALTER TABLE ONLY public.upload_list
    ADD CONSTRAINT upload_list_author_id_fkey FOREIGN KEY (author_id) REFERENCES public.app_user(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: upload_list upload_list_channel_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: letschurch
--

ALTER TABLE ONLY public.upload_list
    ADD CONSTRAINT upload_list_channel_id_fkey FOREIGN KEY (channel_id) REFERENCES public.channel(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: upload_list_entry upload_list_entry_upload_list_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: letschurch
--

ALTER TABLE ONLY public.upload_list_entry
    ADD CONSTRAINT upload_list_entry_upload_list_id_fkey FOREIGN KEY (upload_list_id) REFERENCES public.upload_list(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: upload_list_entry upload_list_entry_upload_record_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: letschurch
--

ALTER TABLE ONLY public.upload_list_entry
    ADD CONSTRAINT upload_list_entry_upload_record_id_fkey FOREIGN KEY (upload_record_id) REFERENCES public.upload_record(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: upload_record upload_record_app_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: letschurch
--

ALTER TABLE ONLY public.upload_record
    ADD CONSTRAINT upload_record_app_user_id_fkey FOREIGN KEY (app_user_id) REFERENCES public.app_user(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: upload_record upload_record_channel_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: letschurch
--

ALTER TABLE ONLY public.upload_record
    ADD CONSTRAINT upload_record_channel_id_fkey FOREIGN KEY (channel_id) REFERENCES public.channel(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: upload_record_download_size upload_record_download_size_upload_record_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: letschurch
--

ALTER TABLE ONLY public.upload_record_download_size
    ADD CONSTRAINT upload_record_download_size_upload_record_id_fkey FOREIGN KEY (upload_record_id) REFERENCES public.upload_record(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: upload_record upload_record_upload_finalized_by_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: letschurch
--

ALTER TABLE ONLY public.upload_record
    ADD CONSTRAINT upload_record_upload_finalized_by_id_fkey FOREIGN KEY (upload_finalized_by_id) REFERENCES public.app_user(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: upload_user_comment upload_user_comment_author_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: letschurch
--

ALTER TABLE ONLY public.upload_user_comment
    ADD CONSTRAINT upload_user_comment_author_id_fkey FOREIGN KEY (author_id) REFERENCES public.app_user(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: upload_user_comment_rating upload_user_comment_rating_app_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: letschurch
--

ALTER TABLE ONLY public.upload_user_comment_rating
    ADD CONSTRAINT upload_user_comment_rating_app_user_id_fkey FOREIGN KEY (app_user_id) REFERENCES public.app_user(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: upload_user_comment_rating upload_user_comment_rating_upload_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: letschurch
--

ALTER TABLE ONLY public.upload_user_comment_rating
    ADD CONSTRAINT upload_user_comment_rating_upload_id_fkey FOREIGN KEY (upload_id) REFERENCES public.upload_user_comment(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: upload_user_comment upload_user_comment_replying_to_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: letschurch
--

ALTER TABLE ONLY public.upload_user_comment
    ADD CONSTRAINT upload_user_comment_replying_to_id_fkey FOREIGN KEY (replying_to_id) REFERENCES public.upload_user_comment(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: upload_user_comment upload_user_comment_upload_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: letschurch
--

ALTER TABLE ONLY public.upload_user_comment
    ADD CONSTRAINT upload_user_comment_upload_id_fkey FOREIGN KEY (upload_id) REFERENCES public.upload_record(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: upload_user_rating upload_user_rating_app_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: letschurch
--

ALTER TABLE ONLY public.upload_user_rating
    ADD CONSTRAINT upload_user_rating_app_user_id_fkey FOREIGN KEY (app_user_id) REFERENCES public.app_user(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: upload_user_rating upload_user_rating_upload_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: letschurch
--

ALTER TABLE ONLY public.upload_user_rating
    ADD CONSTRAINT upload_user_rating_upload_id_fkey FOREIGN KEY (upload_id) REFERENCES public.upload_record(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: upload_view upload_view_app_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: letschurch
--

ALTER TABLE ONLY public.upload_view
    ADD CONSTRAINT upload_view_app_user_id_fkey FOREIGN KEY (app_user_id) REFERENCES public.app_user(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: upload_view_ranges upload_view_ranges_app_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: letschurch
--

ALTER TABLE ONLY public.upload_view_ranges
    ADD CONSTRAINT upload_view_ranges_app_user_id_fkey FOREIGN KEY (app_user_id) REFERENCES public.app_user(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: upload_view_ranges upload_view_ranges_upload_record_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: letschurch
--

ALTER TABLE ONLY public.upload_view_ranges
    ADD CONSTRAINT upload_view_ranges_upload_record_id_fkey FOREIGN KEY (upload_record_id) REFERENCES public.upload_record(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: upload_view upload_view_upload_record_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: letschurch
--

ALTER TABLE ONLY public.upload_view
    ADD CONSTRAINT upload_view_upload_record_id_fkey FOREIGN KEY (upload_record_id) REFERENCES public.upload_record(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- PostgreSQL database dump complete
--


