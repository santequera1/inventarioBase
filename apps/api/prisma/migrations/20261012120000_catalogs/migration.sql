-- CreateTable
CREATE TABLE "Catalog" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "whatsappPhone" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "allProducts" BOOLEAN NOT NULL DEFAULT false,
    "showStock" BOOLEAN NOT NULL DEFAULT false,
    "hideOutOfStock" BOOLEAN NOT NULL DEFAULT false,
    "locationId" TEXT,
    "messageIntro" TEXT,
    "views" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Catalog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CatalogItem" (
    "id" TEXT NOT NULL,
    "catalogId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "CatalogItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CatalogInquiry" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "catalogId" TEXT NOT NULL,
    "customerName" TEXT,
    "customerNote" TEXT,
    "items" JSONB NOT NULL,
    "itemCount" INTEGER NOT NULL,
    "total" INTEGER NOT NULL,
    "message" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'NEW',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CatalogInquiry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Catalog_slug_key" ON "Catalog"("slug");

-- CreateIndex
CREATE INDEX "CatalogItem_productId_idx" ON "CatalogItem"("productId");

-- CreateIndex
CREATE UNIQUE INDEX "CatalogItem_catalogId_productId_key" ON "CatalogItem"("catalogId", "productId");

-- CreateIndex
CREATE UNIQUE INDEX "CatalogInquiry_code_key" ON "CatalogInquiry"("code");

-- CreateIndex
CREATE INDEX "CatalogInquiry_catalogId_createdAt_idx" ON "CatalogInquiry"("catalogId", "createdAt");

-- CreateIndex
CREATE INDEX "CatalogInquiry_createdAt_idx" ON "CatalogInquiry"("createdAt");

-- AddForeignKey
ALTER TABLE "CatalogItem" ADD CONSTRAINT "CatalogItem_catalogId_fkey" FOREIGN KEY ("catalogId") REFERENCES "Catalog"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CatalogItem" ADD CONSTRAINT "CatalogItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CatalogInquiry" ADD CONSTRAINT "CatalogInquiry_catalogId_fkey" FOREIGN KEY ("catalogId") REFERENCES "Catalog"("id") ON DELETE CASCADE ON UPDATE CASCADE;

