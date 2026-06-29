-- Add file_name column to files table for display purposes.
ALTER TABLE public.files ADD COLUMN IF NOT EXISTS file_name text;
