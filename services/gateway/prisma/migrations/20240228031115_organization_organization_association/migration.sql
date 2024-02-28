-- CreateTable
CREATE TABLE "organization_organization_association" (
    "upstream_organization_id" UUID NOT NULL,
    "downstream_organization_id" UUID NOT NULL,
    "upstream_approved" BOOLEAN NOT NULL DEFAULT false,
    "downstream_approved" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "organization_organization_association_pkey" PRIMARY KEY ("upstream_organization_id","downstream_organization_id")
);

-- AddForeignKey
ALTER TABLE "organization_organization_association" ADD CONSTRAINT "organization_organization_association_upstream_organizatio_fkey" FOREIGN KEY ("upstream_organization_id") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "organization_organization_association" ADD CONSTRAINT "organization_organization_association_downstream_organizat_fkey" FOREIGN KEY ("downstream_organization_id") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
