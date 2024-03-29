-- CreateEnum
CREATE TYPE "organization_denomination" AS ENUM ('NON', 'CHRISTIAN', 'PROTESTANT', 'BAPTIST', 'REFORMED_BAPTIST', 'PARTICULAR_BAPTIST', 'SOUTHERN_BAPTIST', 'INDEPENDENT_BAPTIST', 'REFORMED', 'INDEPENDENT', 'PRESBYTERIAN', 'PRESBYTERIAN_ARP', 'PRESBYTERIAN_PCA', 'PRESBYTERIAN_RPCUS', 'PRESBYTERIAN_RPCNA', 'PRESBYTERIAN_OPC', 'PRESBYTERIAN_CREC', 'LUTHERAN', 'LUTHERAN_TAALC', 'INTERDENOMINATIONAL', 'EVANGELICAL_FREE');

-- AlterTable
ALTER TABLE "organization" ADD COLUMN     "denomination" "organization_denomination";
