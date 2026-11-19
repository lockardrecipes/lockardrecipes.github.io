-- Run this once in the Supabase SQL Editor to enable manually supplied recipe photos.
alter table public.recipes add column if not exists photo_url text;
