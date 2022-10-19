SET check_function_bodies = false;
CREATE FUNCTION public.set_current_timestamp_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE
  _new record;
BEGIN
  _new := NEW;
  _new."updated_at" = NOW();
  RETURN _new;
END;
$$;
CREATE TABLE public.app_user (
    id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE public.app_user_email (
    id uuid NOT NULL,
    user_id uuid NOT NULL,
    email public.citext NOT NULL,
    verified boolean NOT NULL,
    created_at timestamp with time zone NOT NULL,
    updated_at timestamp with time zone NOT NULL
);
CREATE TABLE public.channel (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    slug public.citext NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE public.channel_membership (
    channel_id uuid NOT NULL,
    user_id uuid NOT NULL,
    is_public boolean DEFAULT false NOT NULL,
    is_admin boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE public.channel_organization_association (
    channel_id uuid NOT NULL,
    organization_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE public.organization (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    slug public.citext NOT NULL,
    name text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE public.organization_membership (
    organization_id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    is_public boolean DEFAULT false NOT NULL,
    is_admin boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE ONLY public.app_user_email
    ADD CONSTRAINT app_user_email_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.app_user
    ADD CONSTRAINT app_user_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.channel_membership
    ADD CONSTRAINT channel_membership_pkey PRIMARY KEY (channel_id, user_id);
ALTER TABLE ONLY public.channel_organization_association
    ADD CONSTRAINT channel_organization_association_pkey PRIMARY KEY (channel_id, organization_id);
ALTER TABLE ONLY public.channel
    ADD CONSTRAINT channel_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.channel
    ADD CONSTRAINT channel_slug_key UNIQUE (slug);
ALTER TABLE ONLY public.organization
    ADD CONSTRAINT ministry_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.organization
    ADD CONSTRAINT ministry_slug_key UNIQUE (slug);
ALTER TABLE ONLY public.organization_membership
    ADD CONSTRAINT organization_membership_pkey PRIMARY KEY (organization_id, user_id);
CREATE TRIGGER set_public_app_user_updated_at BEFORE UPDATE ON public.app_user FOR EACH ROW EXECUTE FUNCTION public.set_current_timestamp_updated_at();
COMMENT ON TRIGGER set_public_app_user_updated_at ON public.app_user IS 'trigger to set value of column "updated_at" to current timestamp on row update';
CREATE TRIGGER set_public_channel_membership_updated_at BEFORE UPDATE ON public.channel_membership FOR EACH ROW EXECUTE FUNCTION public.set_current_timestamp_updated_at();
COMMENT ON TRIGGER set_public_channel_membership_updated_at ON public.channel_membership IS 'trigger to set value of column "updated_at" to current timestamp on row update';
CREATE TRIGGER set_public_channel_organization_association_updated_at BEFORE UPDATE ON public.channel_organization_association FOR EACH ROW EXECUTE FUNCTION public.set_current_timestamp_updated_at();
COMMENT ON TRIGGER set_public_channel_organization_association_updated_at ON public.channel_organization_association IS 'trigger to set value of column "updated_at" to current timestamp on row update';
CREATE TRIGGER set_public_channel_updated_at BEFORE UPDATE ON public.channel FOR EACH ROW EXECUTE FUNCTION public.set_current_timestamp_updated_at();
COMMENT ON TRIGGER set_public_channel_updated_at ON public.channel IS 'trigger to set value of column "updated_at" to current timestamp on row update';
CREATE TRIGGER set_public_organization_membership_updated_at BEFORE UPDATE ON public.organization_membership FOR EACH ROW EXECUTE FUNCTION public.set_current_timestamp_updated_at();
COMMENT ON TRIGGER set_public_organization_membership_updated_at ON public.organization_membership IS 'trigger to set value of column "updated_at" to current timestamp on row update';
CREATE TRIGGER set_public_organization_updated_at BEFORE UPDATE ON public.organization FOR EACH ROW EXECUTE FUNCTION public.set_current_timestamp_updated_at();
COMMENT ON TRIGGER set_public_organization_updated_at ON public.organization IS 'trigger to set value of column "updated_at" to current timestamp on row update';
ALTER TABLE ONLY public.app_user_email
    ADD CONSTRAINT app_user_email_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.app_user(id) ON UPDATE RESTRICT ON DELETE CASCADE;
ALTER TABLE ONLY public.channel_membership
    ADD CONSTRAINT channel_membership_channel_id_fkey FOREIGN KEY (channel_id) REFERENCES public.channel(id) ON UPDATE RESTRICT ON DELETE CASCADE;
ALTER TABLE ONLY public.channel_membership
    ADD CONSTRAINT channel_membership_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.app_user(id) ON UPDATE RESTRICT ON DELETE CASCADE;
ALTER TABLE ONLY public.channel_organization_association
    ADD CONSTRAINT channel_organization_association_channel_id_fkey FOREIGN KEY (channel_id) REFERENCES public.channel(id) ON UPDATE RESTRICT ON DELETE CASCADE;
ALTER TABLE ONLY public.channel_organization_association
    ADD CONSTRAINT channel_organization_association_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organization(id) ON UPDATE RESTRICT ON DELETE CASCADE;
ALTER TABLE ONLY public.organization_membership
    ADD CONSTRAINT organization_membership_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organization(id) ON UPDATE RESTRICT ON DELETE CASCADE;
ALTER TABLE ONLY public.organization_membership
    ADD CONSTRAINT organization_membership_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.app_user(id) ON UPDATE RESTRICT ON DELETE CASCADE;
