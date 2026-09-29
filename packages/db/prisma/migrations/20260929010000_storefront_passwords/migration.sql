-- Encrypted passwords for password-protected storefronts (the current site and
-- the new Shopline preview), so Site QA can get past the password page.
-- Additive and nullable.
ALTER TABLE "StorefrontProfile"
    ADD COLUMN "storefrontPasswordEnc" TEXT,
    ADD COLUMN "destinationPasswordEnc" TEXT;
