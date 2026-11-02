/** Jest + SWC (TypeScript 7 tidak menyediakan compiler API untuk ts-jest). */
module.exports = {
  testEnvironment: 'node',
  roots: ['<rootDir>/test'],
  testMatch: ['**/*.spec.ts'],
  // Integration test butuh backend berjalan → dijalankan terpisah lewat `npm run test:api`
  testPathIgnorePatterns: ['/node_modules/', '/test/integration/'],
  transform: {
    // .js ikut ditransformasi karena @nestjs/* v12 dirilis sebagai ESM (lihat transformIgnorePatterns)
    '^.+\\.(t|j)s$': [
      '@swc/jest',
      {
        jsc: {
          parser: { syntax: 'typescript', decorators: true },
          transform: { legacyDecorator: true, decoratorMetadata: true },
          target: 'es2023',
        },
        module: { type: 'commonjs' },
      },
    ],
  },
  transformIgnorePatterns: ['/node_modules/(?!@nestjs/)'],
  // Import ".js" di kode hasil generate Prisma menunjuk ke file .ts
  moduleNameMapper: { '^(\\.{1,2}/.*)\\.js$': '$1' },
  moduleFileExtensions: ['ts', 'js', 'json'],
  collectCoverageFrom: ['src/**/*.ts', '!src/generated/**', '!src/main.ts', '!src/database/seeds/**', '!src/scripts/**'],
};
