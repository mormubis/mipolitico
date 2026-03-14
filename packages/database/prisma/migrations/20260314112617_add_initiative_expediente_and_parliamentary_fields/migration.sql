/*
  Warnings:

  - A unique constraint covering the columns `[legislature,expedienteNumero]` on the table `Initiative` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "Initiative" ADD COLUMN "expedienteNumero" TEXT;
ALTER TABLE "Initiative" ADD COLUMN "resultadoTramitacion" TEXT;
ALTER TABLE "Initiative" ADD COLUMN "situacion" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Initiative_legislature_expedienteNumero_key" ON "Initiative"("legislature", "expedienteNumero");
