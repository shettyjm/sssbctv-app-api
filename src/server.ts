// src/server.ts
import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import { rateLimit } from 'express-rate-limit';
import helmet from 'helmet';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// Constants and Enums
const VALID_DIETIES = [
  'Ganesha',
  'Shiva',
  'Rama',
  'Krishna',
  'Sarva Dharma',
  'Rama, Krishna',
  'Multi Faith',
  'Other'
] as const;

const VALID_TEMPOS = [
  'Slow',
  'Medium',
  'Fast',
  'Very Fast'
] as const;

const VALID_OFFERING_STATUSES = [
  'SUNDAY-THISWEEK',
  'THURSDAY-THISWEEK',
  'NEXT-SUNDAY',
  'NEXT-THURSDAY',
  'PENDING'
] as const;

// Valid fields for sorting
const VALID_SORT_FIELDS = [
  'id',
  'created_at',
  'title',
  'position',
  'singer',
  'details',
  'signedUp',
  'tempo',
  'tempoIcon',
  'diety',
  'dietyIcon',
  'offering_on',
  'offeringStatus'
] as const;

// Types
type DietyType = typeof VALID_DIETIES[number];
type TempoType = typeof VALID_TEMPOS[number];
type OfferingStatusType = typeof VALID_OFFERING_STATUSES[number];
type SortFieldType = typeof VALID_SORT_FIELDS[number];

interface BhajanSignupDto {
  id: string;
  created_at: string;
  title: string | null;
  position: number;
  singer: string | null;
  details: string | null;
  signedUp: boolean;
  tempo: TempoType;
  tempoIcon: string | null;
  diety: DietyType;
  dietyIcon: string | null;
  offering_on: string | null;
  offeringStatus: OfferingStatusType;
}

interface GetBhajanSignupsRequest {
  filters?: {
    created_at?: string;
    singer?: string;
    diety?: DietyType;
    tempo?: TempoType;
    offering_on?: string;
    offeringStatus?: OfferingStatusType;
    signedUp?: boolean;
  };
  pagination?: {
    page: number;
    pageSize: number;
  };
  sort?: {
    field: SortFieldType;
    order: 'asc' | 'desc';
  };
}

// Validation functions
const isValidDate = (dateStr: string): boolean => {
  const date = new Date(dateStr);
  return date instanceof Date && !isNaN(date.getTime());
};

const isValidUUID = (str: string): boolean => {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  return uuidRegex.test(str);
};

// Validation Middleware
const validateRequest = (
  req: express.Request,
  res: express.Response,
  next: express.NextFunction
): void => {
  const body: GetBhajanSignupsRequest = req.body;

  // Validate filters if present
  if (body.filters) {
    const { diety, tempo, offeringStatus, created_at, offering_on } = body.filters;

    // Validate diety
    if (diety && !VALID_DIETIES.includes(diety)) {
      res.status(400).json({
        error: 'Invalid diety value',
        validValues: VALID_DIETIES
      });
      return;
    }

    // Validate tempo
    if (tempo && !VALID_TEMPOS.includes(tempo)) {
      res.status(400).json({
        error: 'Invalid tempo value',
        validValues: VALID_TEMPOS
      });
      return;
    }

    // Validate offeringStatus
    if (offeringStatus && !VALID_OFFERING_STATUSES.includes(offeringStatus)) {
      res.status(400).json({
        error: 'Invalid offering status',
        validValues: VALID_OFFERING_STATUSES
      });
      return;
    }

    // Validate dates
    if (created_at && !isValidDate(created_at)) {
      res.status(400).json({
        error: 'Invalid created_at date format'
      });
      return;
    }

    if (offering_on && !isValidDate(offering_on)) {
      res.status(400).json({
        error: 'Invalid offering_on date format'
      });
      return;
    }

    // Validate boolean
    if (body.filters.signedUp !== undefined && typeof body.filters.signedUp !== 'boolean') {
      res.status(400).json({
        error: 'signedUp must be a boolean value'
      });
      return;
    }
  }

  // Validate pagination
  if (body.pagination) {
    const { page, pageSize } = body.pagination;
    if (
      !Number.isInteger(page) ||
      !Number.isInteger(pageSize) ||
      page < 1 ||
      pageSize < 1 ||
      pageSize > 100
    ) {
      res.status(400).json({
        error: 'Invalid pagination values. Page must be >= 1 and pageSize must be between 1 and 100'
      });
      return;
    }
  }

  // Validate sort
  if (body.sort) {
    if (!VALID_SORT_FIELDS.includes(body.sort.field)) {
      res.status(400).json({
        error: 'Invalid sort field',
        validFields: VALID_SORT_FIELDS
      });
      return;
    }
    if (!['asc', 'desc'].includes(body.sort.order)) {
      res.status(400).json({
        error: 'Invalid sort order. Must be "asc" or "desc"'
      });
      return;
    }
  }

  next();
};

// Initialize Supabase client
const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
);

// Middleware
app.use(express.json());
app.use(cors());
app.use(helmet());
app.use(rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100
}));

// Error handler middleware
app.use((err: Error, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Something went wrong!' });
});

// Health check endpoint
app.get('/health', (_req: express.Request, res: express.Response) => {
  res.status(200).json({ 
    status: 'healthy',
    validDieties: VALID_DIETIES,
    validTempos: VALID_TEMPOS,
    validOfferingStatuses: VALID_OFFERING_STATUSES,
    validSortFields: VALID_SORT_FIELDS
  });
});

// Main API endpoint with validation
app.post('/api/bhajan-signups', validateRequest, async (req: express.Request, res: express.Response) => {
  try {
    const body: GetBhajanSignupsRequest = req.body;
    const { filters, pagination, sort } = body;
    
    let query = supabase
      .from('Bhajan_Signups')
      .select('*', { count: 'exact' });

    if (filters) {
      Object.entries(filters).forEach(([key, value]) => {
        if (value !== undefined) {
          if (key === 'singer') {
            query = query.ilike(key, `%${value}%`);
          } else {
            query = query.eq(key, value);
          }
        }
      });
    }

    if (sort) {
      query = query.order(sort.field, { ascending: sort.order === 'asc' });
    }

    if (pagination) {
      const { page, pageSize } = pagination;
      const start = (page - 1) * pageSize;
      query = query.range(start, start + pageSize - 1);
    }

    const { data, error, count } = await query;

    if (error) throw error;

    res.json({
      data,
      total: count || 0,
      page: pagination?.page || 1,
      pageSize: pagination?.pageSize || data.length,
    });
  } catch (error) {
    console.error('Error in /api/bhajan-signups:', error);
    res.status(500).json({ error: 'Failed to fetch Bhajan signups' });
  }
});

// Start server
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});