import mongoose from 'mongoose';
import { connectDatabase, entryModel } from '../server/heritage.js';

const TOTAL = 1000;
const districts = ['Achham', 'Bajhang', 'Bajura', 'Baitadi', 'Darchula', 'Dadeldhura', 'Doti', 'Kailali', 'Kanchanpur'];
const categories = ['Load test sample · Temple', 'Load test sample · Landscape', 'Load test sample · Intangible heritage'];

try {
  await connectDatabase();
  const Entry = entryModel();
  const operations = Array.from({ length: TOTAL }, (_, index) => {
    const number = index + 1;
    const sequence = String(number).padStart(4, '0');
    const district = districts[index % districts.length];
    const category = categories[index % categories.length];
    const record = {
      heritageId: `LOADTEST-${sequence}`,
      slug: `loadtest-sample-${sequence}`,
      title: `Load Test Heritage Sample ${sequence}`,
      aliases: [`Synthetic sample ${sequence}`],
      category,
      district,
      municipality: `Test Municipality ${String((index % 25) + 1).padStart(2, '0')}`,
      summary: `Synthetic ${category.toLowerCase()} record used only to measure Explorer and API performance. This is not a real heritage site.`,
      description: `LOAD TEST DATA — record ${sequence} of ${TOTAL}. This synthetic entry was added for performance testing and does not describe a real place or community tradition.`,
      architecturalFeatures: 'Synthetic test value; not a documented architectural description.',
      story: null,
      source: 'Smart Heritage Atlas · synthetic load test data',
      sourceUrls: [],
      image: null,
      imageSource: null,
      imageCredit: null,
      imageLicense: null,
      modelUrl: null,
      status: 'Illustrative sample',
      visibility: 'Public',
      consent: false,
    };
    return {
      updateOne: {
        filter: { slug: record.slug },
        update: { $set: record },
        upsert: true,
      },
    };
  });

  const result = await Entry.bulkWrite(operations, { ordered: false });
  const loadTestCount = await Entry.countDocuments({ slug: /^loadtest-sample-/ });
  console.log(JSON.stringify({
    database: mongoose.connection.name,
    requested: TOTAL,
    inserted: result.upsertedCount,
    updated: result.modifiedCount,
    loadTestRecordsInDatabase: loadTestCount,
  }, null, 2));
} catch (error) {
  console.error(`Load-test seed failed: ${error.name}: ${error.message}`);
  process.exitCode = 1;
} finally {
  await mongoose.disconnect().catch(() => {});
}
