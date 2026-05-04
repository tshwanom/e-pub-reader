import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const bookId = 'cmopyyjmd0000khivhga54rdx';
  
  const bookData: any = {
    title: 'Test Book Update',
    author: 'Test Author',
    description: '',
    status: 'DRAFT',
    donorOnly: false,
    donationEnabled: false,
    donationMessage: '',
    donationGoal: '',
    amazonKdpUrl: '',
  };

  try {
    // Sanitize numeric fields that might come in as empty strings
    if ('donationGoal' in bookData) {
      if (bookData.donationGoal === '' || bookData.donationGoal === null) {
        bookData.donationGoal = null;
      } else {
        bookData.donationGoal = Number(bookData.donationGoal);
      }
    }

    console.log('Sanitized Data:', bookData);

    const updated = await prisma.book.update({
      where: { id: bookId },
      data: bookData,
    });
    console.log('Update Success:', updated.id);
  } catch (error) {
    console.error('Update Failed:', error);
  } finally {
    await prisma.$disconnect();
  }
}

main();
