import prisma from '../../../util/prisma';

// https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Math/random#getting_a_random_integer_between_two_values_inclusive
function getRandomIntInclusive(min: number, max: number) {
  min = Math.ceil(min);
  max = Math.floor(max);
  return Math.floor(Math.random() * (max - min + 1) + min); // The maximum is inclusive and the minimum is inclusive
}

export default async function updateDailySalt() {
  const old = await prisma.trackingSalt.findFirst({
    select: { id: true },
    orderBy: { id: 'desc' },
  });

  await prisma.trackingSalt.create({
    data: { salt: getRandomIntInclusive(-2147483648, 2147483647) },
  });

  if (old) {
    await prisma.trackingSalt.delete({ where: { id: old.id } });
  }
}
