import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const CATEGORIES = [
  { id: 'ccec8541-95da-4bb4-aadb-199e5fe633d8', name: 'technology' },
  { id: 'acc7a2e3-c005-4bd9-9258-0926b9842d75', name: 'gaming' },
  { id: 'dea55590-5148-4723-9063-008edbe3adf7', name: 'anime_manga' },
  { id: '13615218-a8d8-4f55-89ee-093048b61ee2', name: 'movies_tv' },
  { id: '78373e34-693b-4c7b-8feb-f90bca7bf0cf', name: 'arts_creativity' },
  { id: 'f144d4ed-837e-4697-bd18-4d6bed5c1658', name: 'education_study_groups' },
  { id: '3820344b-4b67-497b-8048-703419198629', name: 'books_writing' },
  { id: '7579faeb-5385-436a-b2a7-24a087233220', name: 'music_entertainment' },
  { id: '5362e75a-a594-4818-b791-1138d380284e', name: 'health_fitness' },
  { id: '1a55efee-d85e-4dab-b299-8984d9841ebf', name: 'outdoor_adventure' },
  { id: '868a9d88-bee0-44bb-889a-d12b4d8c1d71', name: 'sports' },
  { id: '5b07025d-c09a-43ad-af8c-75b11601bd48', name: 'social_lifestyle' },
  { id: 'c4e7d532-7709-4e18-b6ae-cee521298e65', name: 'culture_language' },
  { id: '3eb224da-e96f-44ad-a231-0d449e3ac69e', name: 'other' },
];

async function main() {
  console.log('Seeding categories...');

  // Upsert: only creates if not exists, skips if already there
  for (const cat of CATEGORIES) {
    await prisma.categories.upsert({
      where: { id: cat.id },
      update: {}, // don't change anything if exists
      create: cat,
    });
  }

  console.log(`Seeded ${CATEGORIES.length} categories.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });