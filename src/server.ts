// src/server.ts
import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { createClient, PostgrestError } from '@supabase/supabase-js';
import { rateLimit } from 'express-rate-limit';
import helmet from 'helmet';
import { performance } from 'perf_hooks';

// Load environment variables
dotenv.config();

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

// Types
type DietyType = typeof VALID_DIETIES[number];
type TempoType = typeof VALID_TEMPOS[number];
type OfferingStatusType = typeof VALID_OFFERING_STATUSES[number];

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
    field: keyof BhajanSignupDto;
    order: 'asc' | 'desc';
  };
}

// Validation Middleware
const validateRequest = (
  req: express.Request,
  res: express.Response,
  next: express.NextFunction
): void => {
  try {
    const body: GetBhajanSignupsRequest = req.body;

    if (body.filters) {
      const { diety, tempo, offeringStatus, created_at, offering_on } = body.filters;

      if (diety && !VALID_DIETIES.includes(diety)) {
        res.status(400).json({
          error: 'Invalid diety value',
          validValues: VALID_DIETIES
        });
        return;
      }

      if (tempo && !VALID_TEMPOS.includes(tempo)) {
        res.status(400).json({
          error: 'Invalid tempo value',
          validValues: VALID_TEMPOS
        });
        return;
      }

      if (offeringStatus && !VALID_OFFERING_STATUSES.includes(offeringStatus)) {
        res.status(400).json({
          error: 'Invalid offering status',
          validValues: VALID_OFFERING_STATUSES
        });
        return;
      }

      if (created_at && isNaN(Date.parse(created_at))) {
        res.status(400).json({
          error: 'Invalid created_at date format'
        });
        return;
      }

      if (offering_on && isNaN(Date.parse(offering_on))) {
        res.status(400).json({
          error: 'Invalid offering_on date format'
        });
        return;
      }

      if (body.filters.signedUp !== undefined && typeof body.filters.signedUp !== 'boolean') {
        res.status(400).json({
          error: 'signedUp must be a boolean value'
        });
        return;
      }
    }

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

    if (body.sort) {
      if (!['asc', 'desc'].includes(body.sort.order)) {
        res.status(400).json({
          error: 'Invalid sort order. Must be "asc" or "desc"'
        });
        return;
      }
    }

    next();
  } catch (error) {
    res.status(400).json({
      error: 'Invalid request format'
    });
  }
};

// Initialize Express app
const app = express();
const PORT = process.env.PORT || 3000;

// Apply middleware
app.use(express.json());
app.use(cors());
app.use(helmet());
app.use(rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100
}));

// Initialize Supabase client
const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY!;

const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  },
  db: {
    schema: 'public'
  }
});

// Health check endpoint
app.get('/health', (_req: express.Request, res: express.Response) => {
  res.status(200).json({ 
    status: 'healthy',
    validDieties: VALID_DIETIES,
    validTempos: VALID_TEMPOS,
    validOfferingStatuses: VALID_OFFERING_STATUSES
  });
});

// Test connection endpoint
app.get('/api/test-connection', async (_req: express.Request, res: express.Response) => {
  try {
    const { data, error } = await supabase
      .from('Bhajan_Signups')
      .select('offeringStatus')
      .limit(1);

    if (error) {
      throw error;
    }

    res.json({
      status: 'success',
      connected: !!data
    });
  } catch (error) {
    const pgError = error as PostgrestError;
    res.status(500).json({
      error: 'Failed to connect to database',
      details: pgError.message
    });
  }
});

// Main API endpoint
app.post('/api/bhajan-signups', validateRequest, async (req: express.Request, res: express.Response) => {
  try {
    const startTime = performance.now();
    const body: GetBhajanSignupsRequest = req.body;
    const { filters, pagination, sort } = body;
    
    console.log('Processing request with filters:', JSON.stringify(filters, null, 2));

    // Build optimized query
    let query = supabase
      .from('Bhajan_Signups')
      .select('*', { count: 'exact' });

    // Track applied filters for debugging
    const appliedFilters: Array<{ field: string; operator: string; value: any }> = [];

    // Apply all filters at database level
    if (filters) {
      Object.entries(filters).forEach(([key, value]) => {
        if (value !== undefined) {
          if (key === 'singer') {
            query = query.ilike(key, `%${value}%`);
            appliedFilters.push({ field: key, operator: 'ilike', value: `%${value}%` });
          } else {
            query = query.eq(key, value);
            appliedFilters.push({ field: key, operator: '=', value });
          }
        }
      });
    }

    // Track sort details
    let sortDetails = null;
    if (sort) {
      query = query.order(sort.field, { ascending: sort.order === 'asc' });
      sortDetails = { field: sort.field, order: sort.order };
    }

    // Track pagination details
    let paginationDetails = null;
    if (pagination) {
      const { page, pageSize } = pagination;
      const start = (page - 1) * pageSize;
      query = query.range(start, start + pageSize - 1);
      paginationDetails = { start, end: start + pageSize - 1 };
    }

    // Log the constructed query details
    console.log('Query details:', {
      table: 'Bhajan_Signups',
      filters: appliedFilters,
      sort: sortDetails,
      pagination: paginationDetails,
    });

    // Generate pseudo SQL for debugging
    const generatePseudoSQL = () => {
      let sql = 'SELECT * FROM "Bhajan_Signups"';
      
      if (appliedFilters.length > 0) {
        sql += ' WHERE ' + appliedFilters.map(f => {
          if (f.operator === 'ilike') {
            return `"${f.field}" ILIKE '${f.value}'`;
          }
          return `"${f.field}" = '${f.value}'`;
        }).join(' AND ');
      }

      if (sortDetails) {
        sql += ` ORDER BY "${sortDetails.field}" ${sortDetails.order.toUpperCase()}`;
      }

      if (paginationDetails) {
        sql += ` LIMIT ${paginationDetails.end - paginationDetails.start + 1} OFFSET ${paginationDetails.start}`;
      }

      return sql;
    };

    console.log('Pseudo SQL:', generatePseudoSQL());
    console.log('Executing optimized query...');
    const { data, error, count } = await query;

    if (error) {
      throw error;
    }

    const endTime = performance.now();
    const queryTime = endTime - startTime;

    console.log('Query completed successfully');
    console.log('Results:', {
      count: data?.length || 0,
      executionTime: `${queryTime.toFixed(2)}ms`
    });

    res.json({
      data,
      total: count || 0,
      page: pagination?.page || 1,
      pageSize: pagination?.pageSize || data?.length || 0,
      debug: {
        executionTime: `${queryTime.toFixed(2)}ms`,
        appliedFilters: filters,
        resultCount: data?.length || 0
      }
    });
  } catch (error) {
    console.error('Error in /api/bhajan-signups:', error);
    const pgError = error as PostgrestError;
    res.status(500).json({
      error: 'Failed to fetch Bhajan signups',
      details: pgError.message
    });
  }
});

// Start server
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});