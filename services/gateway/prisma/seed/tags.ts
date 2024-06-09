import { OrganizationTagCategory } from '@prisma/client';
import prisma from '../../src/util/prisma';

export const nonDenomTagSlug = 'non-denominational';
export const reformedTagSlug = 'reformed';
export const baptistTagSlug = 'baptist';
export const calvinisticBaptistTagSlug = 'calvinistic-baptist';
export const southernBaptistTagSlug = 'southern-baptist';
export const independentBaptistTagSlug = 'independent-baptist';
export const reformedBaptistTagSlug = 'reformed-baptist';
export const independentTagSlug = 'independent';
export const presbyterianTagSlug = 'presbyterian';
export const presbyterianArpTagSlug = 'presbyterian-arp';
export const presbyterianEpcTagSlug = 'presbyterian-epc';
export const presbyterianPcaTagSlug = 'presbyterian-pca';
export const presbyterianRpcusTagSlug = 'presbyterian-rpcus';
export const presbyterianRpcnaTagSlug = 'presbyterian-rpcna';
export const presbyterianOpcTagSlug = 'presbyterian-opc';
export const presbyterianCrecTagSlug = 'presbyterian-crec';
export const lutheranTagSlug = 'lutheran';
export const lutheranAalcTagSlug = 'lutheran-aalc';
export const interdenominationalTagSlug = 'interdenominational';
export const evangelicalFreeTagSlug = 'evangelical-free';

export const reformedCredobaptistTagSlug = 'reformed-credobaptist';
export const reformedPaedobaptistTagSlug = 'reformed-paedobaptist';
export const fundamentalistTagSlug = 'fundamentalist-paedobaptist';
export const dispensationalTagSlug = 'dispenational';
export const anabaptistTagSlug = 'anabaptist';
export const calvinisticTagSlug = 'calvinistic';

export const amillennialTagSlug = 'amillennial';
export const premillennialTagSlug = 'premillennial';
export const postmillennialTagSlug = 'postmillennial';

export const firstLondonBaptistConfessionTagSlug =
  'first-london-baptist-confession';
export const secondLondonBaptistConfessionTagSlug =
  'second-london-baptist-confession';
export const augsburgConfessionTagSlug = 'augsburg-confession';
export const scotsConfessionTagSlug = 'scots-confession';
export const belgicConfessionTagSlug = 'belgic-confession';
export const heidelbergCatechismTagSlug = 'heidelberg-catechism';
export const canonsOfDortTagSlug = 'canons-of-dort';
export const threeFormsOfUnityTagSlug = 'three-forms-of-unity';
export const westminsterConfessionTagSlug = 'westminster-confession';
export const savoyDeclarationTagSlug = 'savoy-declaration';
export const philadelphiaConfessionTagSlug = 'philadelphia-declaration';
export const newHampshireConfessionTagSlug = 'new-hampshire-declaration';
export const baptistFaithAndMessageTagSlug = 'baptist-faith-and-message';
export const thirtyNineArticles = 'thirty-nine-articles';

export const psalmsHymnsSpiritualSongsTagSlug = 'psalms-hymns-spiritual-songs';
export const exclusivePsalmodyTagSlug = 'exclusive-psalmody';
export const psalmsAndHymnsTagSlug = 'psalms-and-hymns';
export const contempoaryTagSlug = 'contemporary';

export const eldersAndDeaconsTagSlug = 'elders-and-deacons';
export const pastorsAndDeaconsTagSlug = 'pastors-and-deacons';
export const pastorsEldersAndDeaconsTagSlug = 'pastors-elders-and-deacons';
export const brotherhoodTagSlug = 'brotherhood';

export const familyIntegratedTagSlug = 'family-integrated';
export const weeklyCommunionTagSlug = 'weekly-lords-supper';
export const monthlyCommunionTagSlug = 'monthly-lords-supper';
export const weeklyFellowshipMealTagSlug = 'weekly-fellowship-meal';
export const monthlyFellowshipMealTagSlug = 'monthly-fellowship-meal';

const tagsData: ReadonlyArray<
  Parameters<typeof prisma.organizationTag.upsert>[0]['create'] & {
    suggests?: Array<string>;
  }
> = [
  // Denomination
  {
    category: OrganizationTagCategory.DENOMINATION,
    color: 'BLUE',
    slug: nonDenomTagSlug,
    label: 'Non-Denominational',
  },
  {
    category: OrganizationTagCategory.DENOMINATION,
    slug: reformedTagSlug,
    label: 'Reformed',
    color: 'BLUE',
  },
  {
    category: OrganizationTagCategory.DENOMINATION,
    color: 'BLUE',
    slug: baptistTagSlug,
    label: 'Baptist',
  },
  {
    category: OrganizationTagCategory.DENOMINATION,
    color: 'BLUE',
    slug: independentTagSlug,
    label: 'Independent',
  },
  {
    category: OrganizationTagCategory.DENOMINATION,
    color: 'BLUE',
    slug: southernBaptistTagSlug,
    label: 'Southern Baptist',
    suggests: [baptistTagSlug],
  },
  {
    category: OrganizationTagCategory.DENOMINATION,
    color: 'BLUE',
    slug: independentBaptistTagSlug,
    label: 'Independent Baptist',
    suggests: [baptistTagSlug, independentTagSlug],
  },
  {
    category: OrganizationTagCategory.DENOMINATION,
    color: 'BLUE',
    slug: calvinisticBaptistTagSlug,
    label: 'Calvinistic Baptist',
    suggests: [baptistTagSlug, calvinisticTagSlug],
  },
  {
    category: OrganizationTagCategory.DENOMINATION,
    color: 'BLUE',
    slug: reformedBaptistTagSlug,
    label: 'Reformed Baptist',
    suggests: [reformedTagSlug, baptistTagSlug],
  },
  {
    category: OrganizationTagCategory.DENOMINATION,
    color: 'BLUE',
    slug: presbyterianTagSlug,
    label: 'Presbyterian',
    suggests: [reformedTagSlug],
  },
  {
    category: OrganizationTagCategory.DENOMINATION,
    color: 'BLUE',
    slug: presbyterianArpTagSlug,
    label: 'Presbyterian (ARP)',
    description: 'Associate Reformed Presbyterian',
    suggests: [reformedTagSlug, presbyterianTagSlug],
  },
  {
    category: OrganizationTagCategory.DENOMINATION,
    color: 'BLUE',
    slug: presbyterianEpcTagSlug,
    label: 'Presbyterian (EPC)',
    description: 'Evangelical Presbyterian Church',
    suggests: [reformedTagSlug, presbyterianTagSlug],
  },
  {
    category: OrganizationTagCategory.DENOMINATION,
    color: 'BLUE',
    slug: presbyterianPcaTagSlug,
    label: 'Presbyterian (PCA)',
    description: 'Presbyterian Church in America',
    suggests: [reformedTagSlug, presbyterianTagSlug],
  },
  {
    category: OrganizationTagCategory.DENOMINATION,
    color: 'BLUE',
    slug: presbyterianRpcusTagSlug,
    label: 'Presbyterian (RPCUS)',
    description: 'Reformed Presbyterian Church in the United States',
    suggests: [reformedTagSlug, presbyterianTagSlug],
  },
  {
    category: OrganizationTagCategory.DENOMINATION,
    color: 'BLUE',
    slug: presbyterianRpcnaTagSlug,
    label: 'Presbyterian (RPCNA)',
    description: 'Reformed Presbyterian Church of North America',
    suggests: [reformedTagSlug, presbyterianTagSlug],
  },
  {
    category: OrganizationTagCategory.DENOMINATION,
    color: 'BLUE',
    slug: presbyterianOpcTagSlug,
    label: 'Presbyterian (OPC)',
    description: 'Orthodox Presbyterian Church',
    suggests: [reformedTagSlug, presbyterianTagSlug],
  },
  {
    category: OrganizationTagCategory.DENOMINATION,
    color: 'BLUE',
    slug: presbyterianCrecTagSlug,
    label: 'Presbyterian (CREC)',
    description: 'Communion of Reformed Evangelical Churches',
    suggests: [reformedTagSlug, presbyterianTagSlug],
  },
  {
    category: OrganizationTagCategory.DENOMINATION,
    color: 'BLUE',
    slug: lutheranTagSlug,
    label: 'Lutheran',
  },
  {
    category: OrganizationTagCategory.DENOMINATION,
    color: 'BLUE',
    slug: lutheranAalcTagSlug,
    label: 'Lutheran (AALC)',
    suggests: [lutheranTagSlug],
  },
  {
    category: OrganizationTagCategory.DENOMINATION,
    color: 'BLUE',
    slug: interdenominationalTagSlug,
    label: 'Interdenominational',
  },
  {
    category: OrganizationTagCategory.DENOMINATION,
    color: 'BLUE',
    slug: evangelicalFreeTagSlug,
    label: 'Evangelical Free',
  },
  // Doctrine
  {
    category: OrganizationTagCategory.DOCTRINE,
    color: 'GREEN',
    slug: reformedCredobaptistTagSlug,
    label: 'Refomed Credobaptist',
    suggests: [reformedTagSlug, baptistTagSlug],
  },
  {
    category: OrganizationTagCategory.DOCTRINE,
    color: 'GREEN',
    slug: reformedPaedobaptistTagSlug,
    label: 'Refomed Paedobaptist',
    suggests: [reformedTagSlug],
  },
  {
    category: OrganizationTagCategory.DOCTRINE,
    color: 'GREEN',
    slug: fundamentalistTagSlug,
    label: 'Fundamentalist',
  },
  {
    category: OrganizationTagCategory.DOCTRINE,
    color: 'GREEN',
    slug: dispensationalTagSlug,
    label: 'Dispensational',
  },
  {
    category: OrganizationTagCategory.DOCTRINE,
    color: 'GREEN',
    slug: anabaptistTagSlug,
    label: 'Anabaptist',
    suggests: ['baptist'],
  },
  {
    category: OrganizationTagCategory.DOCTRINE,
    color: 'GREEN',
    slug: calvinisticTagSlug,
    label: 'Calvinistic',
  },
  // Eschatology
  {
    category: OrganizationTagCategory.ESCHATOLOGY,
    color: 'RED',
    slug: amillennialTagSlug,
    label: 'Amillennial',
  },
  {
    category: OrganizationTagCategory.ESCHATOLOGY,
    color: 'RED',
    slug: premillennialTagSlug,
    label: 'Premillennial',
  },
  {
    category: OrganizationTagCategory.ESCHATOLOGY,
    color: 'RED',
    slug: postmillennialTagSlug,
    label: 'Postmillennial',
  },
  // Confession
  {
    category: OrganizationTagCategory.CONFESSION,
    color: 'INDIGO',
    slug: firstLondonBaptistConfessionTagSlug,
    label: 'First London Baptist Confession (1644/1646)',
    suggests: [baptistTagSlug, reformedBaptistTagSlug, reformedTagSlug],
  },
  {
    category: OrganizationTagCategory.CONFESSION,
    color: 'INDIGO',
    slug: secondLondonBaptistConfessionTagSlug,
    label: 'Second London Baptist Confession (1689)',
    suggests: [baptistTagSlug, reformedBaptistTagSlug, reformedTagSlug],
  },
  {
    category: OrganizationTagCategory.CONFESSION,
    color: 'INDIGO',
    slug: augsburgConfessionTagSlug,
    label: 'Augsburg Confession (1530)',
    suggests: [lutheranTagSlug],
  },
  {
    category: OrganizationTagCategory.CONFESSION,
    color: 'INDIGO',
    slug: scotsConfessionTagSlug,
    label: 'Scots Confession (1560)',
    suggests: [reformedTagSlug],
  },
  {
    category: OrganizationTagCategory.CONFESSION,
    color: 'INDIGO',
    slug: belgicConfessionTagSlug,
    label: 'Belgic Confession (1561)',
    suggests: [reformedTagSlug],
  },
  {
    category: OrganizationTagCategory.CONFESSION,
    color: 'INDIGO',
    slug: heidelbergCatechismTagSlug,
    label: 'Heidelberg Catechism (1563)',
    suggests: [reformedTagSlug],
  },
  {
    category: OrganizationTagCategory.CONFESSION,
    color: 'INDIGO',
    slug: canonsOfDortTagSlug,
    label: 'Canons of Dort (1618-1619)',
    suggests: [reformedTagSlug],
  },
  {
    category: OrganizationTagCategory.CONFESSION,
    color: 'INDIGO',
    slug: threeFormsOfUnityTagSlug,
    label: 'Three Forms of Unity',
    suggests: [
      reformedTagSlug,
      belgicConfessionTagSlug,
      heidelbergCatechismTagSlug,
      canonsOfDortTagSlug,
    ],
  },
  {
    category: OrganizationTagCategory.CONFESSION,
    color: 'INDIGO',
    slug: westminsterConfessionTagSlug,
    label: 'Westminster Confession (1646)',
    suggests: [reformedTagSlug],
  },
  {
    category: OrganizationTagCategory.CONFESSION,
    color: 'INDIGO',
    slug: savoyDeclarationTagSlug,
    label: 'Savoy Declaration (1658)',
    suggests: [reformedTagSlug],
  },
  {
    category: OrganizationTagCategory.CONFESSION,
    color: 'INDIGO',
    slug: philadelphiaConfessionTagSlug,
    label: 'Philadelphia Confession (1742)',
    suggests: [reformedTagSlug, reformedBaptistTagSlug, baptistTagSlug],
  },
  {
    category: OrganizationTagCategory.CONFESSION,
    color: 'INDIGO',
    slug: newHampshireConfessionTagSlug,
    label: 'New Hampshire Baptist Confession (1833)',
    suggests: [baptistTagSlug],
  },
  {
    category: OrganizationTagCategory.CONFESSION,
    color: 'INDIGO',
    slug: baptistFaithAndMessageTagSlug,
    label: 'Baptist Faith and Message (2000)',
    suggests: [baptistTagSlug, southernBaptistTagSlug],
  },
  {
    category: OrganizationTagCategory.CONFESSION,
    color: 'INDIGO',
    slug: thirtyNineArticles,
    label: 'Thirty-Nine Articles (1563)',
  },
  // Worship
  {
    category: OrganizationTagCategory.WORSHIP,
    color: 'PINK',
    slug: psalmsHymnsSpiritualSongsTagSlug,
    label: 'Psalms, Hymns, and Spiritual Songs',
  },
  {
    category: OrganizationTagCategory.WORSHIP,
    color: 'PINK',
    slug: exclusivePsalmodyTagSlug,
    label: 'Exclusive Psalmody',
  },
  {
    category: OrganizationTagCategory.WORSHIP,
    color: 'PINK',
    slug: psalmsAndHymnsTagSlug,
    label: 'Psalms and Hymns',
  },
  {
    category: OrganizationTagCategory.WORSHIP,
    color: 'PINK',
    slug: contempoaryTagSlug,
    label: 'Contemporary',
  },
  // Government
  {
    category: OrganizationTagCategory.GOVERNMENT,
    color: 'PURPLE',
    slug: eldersAndDeaconsTagSlug,
    label: 'Elders and Deacons',
  },
  {
    category: OrganizationTagCategory.GOVERNMENT,
    color: 'PURPLE',
    slug: pastorsAndDeaconsTagSlug,
    label: 'Pastors and Deacons',
  },
  {
    category: OrganizationTagCategory.GOVERNMENT,
    color: 'PURPLE',
    slug: pastorsEldersAndDeaconsTagSlug,
    label: 'Pastors, Elders, and Deacons',
  },
  {
    category: OrganizationTagCategory.GOVERNMENT,
    color: 'PURPLE',
    slug: brotherhoodTagSlug,
    label: 'Brotherhood',
  },
  // Other
  {
    category: OrganizationTagCategory.OTHER,
    color: 'GRAY',
    slug: familyIntegratedTagSlug,
    label: 'Family Integrated',
    description: 'Families Worship and Attend Together',
  },
  {
    category: OrganizationTagCategory.OTHER,
    color: 'GRAY',
    slug: weeklyCommunionTagSlug,
    label: 'Weekly Communion',
    description: "The Lord's Supper is celebrated every week",
  },
  {
    category: OrganizationTagCategory.OTHER,
    color: 'GRAY',
    slug: monthlyCommunionTagSlug,
    label: 'Monthly Communion',
    description: "The Lord's Supper is celebrated once a month",
  },
  {
    category: OrganizationTagCategory.OTHER,
    color: 'GRAY',
    slug: weeklyFellowshipMealTagSlug,
    label: 'Weekly Fellowship Meal',
  },
  {
    category: OrganizationTagCategory.OTHER,
    color: 'GRAY',
    slug: monthlyFellowshipMealTagSlug,
    label: 'Monthly Fellowship Meal',
  },
];

for (const { suggests, ...tag } of tagsData) {
  await prisma.organizationTag.upsert({
    where: { slug: tag.slug },
    create: tag,
    update: tag,
  });
}

for (const tag of tagsData) {
  if (tag.suggests) {
    for (const suggest of tag.suggests) {
      await prisma.organizationTagSuggestion.upsert({
        where: {
          parentSlug_suggestedSlug: {
            parentSlug: tag.slug,
            suggestedSlug: suggest,
          },
        },
        create: {
          parentSlug: tag.slug,
          suggestedSlug: suggest,
        },
        update: {},
      });
    }
  }
}
