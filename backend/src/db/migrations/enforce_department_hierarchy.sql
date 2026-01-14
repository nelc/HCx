-- Migration: enforce_department_hierarchy.sql
-- This migration enforces the hierarchy: Sector -> Department -> Section
-- Run this after ensuring all existing data follows the hierarchy

-- Step 1: Fix any existing data that violates hierarchy rules
-- Set parent_id to NULL for sectors that have a parent
UPDATE departments 
SET parent_id = NULL 
WHERE type = 'sector' AND parent_id IS NOT NULL;

-- For departments without a parent, we need to either:
-- a) Set them to have a parent (if sectors exist), or
-- b) Convert them to sectors (if no sectors exist)
-- We'll create a default sector if needed and assign orphaned departments to it
DO $$
DECLARE
    default_sector_id UUID;
    sector_count INTEGER;
BEGIN
    -- Count existing sectors
    SELECT COUNT(*) INTO sector_count FROM departments WHERE type = 'sector';
    
    -- If no sectors exist, create a default one
    IF sector_count = 0 THEN
        INSERT INTO departments (name_ar, type, parent_id)
        VALUES ('القطاع الافتراضي', 'sector', NULL)
        RETURNING id INTO default_sector_id;
    ELSE
        -- Use the first sector as default
        SELECT id INTO default_sector_id FROM departments WHERE type = 'sector' LIMIT 1;
    END IF;
    
    -- Assign orphaned departments to the default sector
    UPDATE departments 
    SET parent_id = default_sector_id 
    WHERE type = 'department' AND parent_id IS NULL;
    
    -- For sections without a parent, assign them to the first department of their sector
    -- or to the first available department
    UPDATE departments d
    SET parent_id = (
        SELECT id FROM departments 
        WHERE type = 'department' 
        AND (d.parent_id IS NULL OR parent_id = (
            SELECT id FROM departments WHERE type = 'sector' LIMIT 1
        ))
        LIMIT 1
    )
    WHERE d.type = 'section' AND d.parent_id IS NULL
    AND EXISTS (SELECT 1 FROM departments WHERE type = 'department');
END $$;

-- Step 2: Remove any duplicates (keep the oldest one)
-- For sectors (parent_id IS NULL)
DELETE FROM departments d1
USING departments d2
WHERE d1.id > d2.id
AND d1.type = 'sector' AND d2.type = 'sector'
AND d1.name_ar = d2.name_ar
AND d1.parent_id IS NULL AND d2.parent_id IS NULL;

-- For departments and sections (parent_id IS NOT NULL)
DELETE FROM departments d1
USING departments d2
WHERE d1.id > d2.id
AND d1.name_ar = d2.name_ar
AND d1.type = d2.type
AND d1.parent_id = d2.parent_id
AND d1.parent_id IS NOT NULL;

-- Step 3: Add unique indexes (using partial indexes for proper NULL handling)
DO $$
BEGIN
    -- Unique index for sectors (parent_id IS NULL)
    IF NOT EXISTS (
        SELECT 1 FROM pg_indexes 
        WHERE indexname = 'unique_sector_name'
    ) THEN
        CREATE UNIQUE INDEX unique_sector_name ON departments (name_ar) 
        WHERE type = 'sector' AND parent_id IS NULL;
    END IF;
    
    -- Unique index for departments and sections (parent_id IS NOT NULL)
    IF NOT EXISTS (
        SELECT 1 FROM pg_indexes 
        WHERE indexname = 'unique_department_name_parent'
    ) THEN
        CREATE UNIQUE INDEX unique_department_name_parent ON departments (name_ar, type, parent_id) 
        WHERE parent_id IS NOT NULL;
    END IF;
END $$;

-- Step 4: Add check constraints for hierarchy enforcement
DO $$
BEGIN
    -- Ensure sectors have no parent
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'sectors_no_parent'
    ) THEN
        ALTER TABLE departments
        ADD CONSTRAINT sectors_no_parent CHECK (
            (type = 'sector' AND parent_id IS NULL) OR 
            (type != 'sector')
        );
    END IF;
    
    -- Ensure departments have a parent (sector)
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'departments_require_parent'
    ) THEN
        ALTER TABLE departments
        ADD CONSTRAINT departments_require_parent CHECK (
            (type = 'department' AND parent_id IS NOT NULL) OR 
            (type != 'department')
        );
    END IF;
    
    -- Ensure sections have a parent (department)
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'sections_require_parent'
    ) THEN
        ALTER TABLE departments
        ADD CONSTRAINT sections_require_parent CHECK (
            (type = 'section' AND parent_id IS NOT NULL) OR 
            (type != 'section')
        );
    END IF;
END $$;

-- Step 5: Add comment for documentation
COMMENT ON CONSTRAINT sectors_no_parent ON departments IS 'Sectors cannot have a parent';
COMMENT ON CONSTRAINT departments_require_parent ON departments IS 'Departments must have a parent sector';
COMMENT ON CONSTRAINT sections_require_parent ON departments IS 'Sections must have a parent department';

