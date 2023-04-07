import prisma from '../../../util/prisma';

export default async function setUploadThumbnail(
  uploadRecordId: string,
  path: string,
  blurhash: string,
) {
  await prisma.uploadRecord.update({
    where: { id: uploadRecordId },
    data: { defaultThumbnailPath: path, thumbnailBlurhash: blurhash },
  });
}
