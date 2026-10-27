-- The archive keeps exactly one admin account.
CREATE UNIQUE INDEX "User_one_admin_idx" ON "User" ("role") WHERE "role" = 'ADMIN';
