// build trgger
// src/server.ts
import express from 'express';
import RequestHandler from 'express'
import cors from 'cors';
import dotenv from 'dotenv';
import { createClient, PostgrestError } from '@supabase/supabase-js';
import { rateLimit } from 'express-rate-limit';
import helmet from 'helmet';
import { performance } from 'perf_hooks';

// Load environment variables
dotenv.config();

// Constants and Enums

const VALID_LABELS = Object.freeze({
  'bhajan_db': 'bhajan_db',
  VALUE2: 'value2',
  VALUE3: 'value3'
});

const VALID_TABLE_NAMES =[
  'bhajan_db'
] as const;
const VALID_DIETIES = [
  'Sai',
  'Ganesha',
  'Shiva',
  'Rama',
  'Krishna',
  'Sarva Dharma',
  'Rama, Krishna',
  'Multi Faith',
  'Other'
] as const;
const DIETY_ICONS: Record<string, string> =
{
  'Sai': "🙏",
  'Shiva': "🕉️",
  'Ganesha': "🐘",
  'Rama': "🏹",
  'Krishna': "🎺",
  'Sarva Dharma': "✨",
  'Rama, Krishna': "✨",
  'Multi Faith': "✨"
}

const VALID_TEMPOS = [
  'Slow',
  'Medium',
  'Fast',
  'Very Fast'
] as const;

const TEMPO_ICONS: Record<string, string> =
{
  'Slow': "🐢",
  'Medium Slow': "🚶",
  'Medium': "⚡",
  'Medium Fast': "🏃",
  'Fast': "🚀"
}

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

interface FormattedBhajanSignup {
  id: string;
  created_at: string;
  title: string | null;
  position: number;
  singer: string | null;
  details: string | null;
  signedUp: boolean;
  tempo: {
    value: string;
    icon: string;
  };
  diety: {
    value: string;
    icon: string;
  };
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


interface DietyDistribution {
  diety: DietyType;
  icon: string,
  count: number;
}

interface TempoDistribution {
  tempo: TempoType;
  icon : string,
  count: number;
}

// interface BhajanDBEntry {
//   id: string;
//   Title: string;
//   Lyrics?: string;
//   Meaning?: string;
//   Deity?: string;
//   Language?: string;
//   Tempo?: string;
//   Level?: string;
//   Raga?: string;
//   Beat?: string;
//   Gents_Pitch?: string;
//   Ladies_Pitch?: string;
//   SaiRhythms_Link?: string;
// }

interface GetBhajansRequest {
  filters?: {
    Deity?: string;
    Tempo?: string;
    Title?: string;
  };
  pagination?: {
    page: number;
    pageSize: number;
  };
}

interface FormattedBhajan {
  id: string;
  Title: string;
  Lyrics?: string;
  Meaning?: string;
  Diety?: {
    value: string;
    icon?: string | null;
  };
  Tempo?: {
    value: string;
    icon?: string | null;
  };
  Language?: string;
  Level?: string;
  Raga?: string;
  Beat?: string;
  Gents_Pitch?: string;
  Ladies_Pitch?: string;
  Links?: {
    SaiRhythms?: string;
    Audio?: string;
  };
}

interface CreateBhajanSignupRequest {
  
  title: string ;
  position ?: number;
  singer: string ;
  details: string | null;
  tempo: {
    value ?: string;
    icon ?: string;
  };
  diety: {
    value ?: string;
    icon ?: string;
  };
  offering_on: string ;
  offeringStatus: OfferingStatusType;
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


// interface CreateBhajanSignupRequest {
//   singer: string;
//   song: string;
//   diety: string;
//   tempo: string;
//   duration: number;
//   date: string;
//   notes?: string;
// }

// Validation middleware for create request
const validateCreateRequest = (req: express.Request,
   res: express.Response, next:
    express.NextFunction): void =>{
  const body = req.body as CreateBhajanSignupRequest;
  
  // Required fields validation
  const missingFields = [];
  if (!body.title) missingFields.push('title');
  if (!body.singer) missingFields.push('singer');
  if (!body.diety) missingFields.push('diety');
  if (!body.tempo) missingFields.push('tempo');
  if (!body.offering_on) missingFields.push('offering_on');

  
  if (missingFields.length > 0) {
     res.status(400).json({
      error: 'Missing required fields',
      details: `Missing: ${missingFields.join(', ')}`
    });
    return;
  }

  // Validate tempo values (assuming these are your valid options)
  // const validTempos = ['Slow', 'Medium', 'Fast'];
  // if (!validTempos.includes(body.tempo.value?)) {
  //    res.status(400).json({
  //     error: 'Invalid tempo value',
  //     details: `Tempo must be one of: ${validTempos.join(', ')}`
  //   });
  //   return;
  // }

  // Duration should be a positive number
  // if (typeof body.duration !== 'number' || body.duration <= 0) {
  //    res.status(400).json({
  //     error: 'Invalid duration',
  //     details: 'Duration must be a positive number'
  //   });
  //   return;
  // }

  // Basic date validation
  // if (!Date.parse(body.date)) {
  //    res.status(400).json({
  //     error: 'Invalid date format',
  //     details: 'Please provide a valid date'
  //   });
  //   return;
  // }

  next();
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
const supabaseKey = process.env.SUPABASE_SERVICE_KEY1!;



console.log('Initializing Supabase with URL:', supabaseUrl.substring(0, 20) + '...');


//console.log('!!!! Remove this . supabaseKey:', supabaseKey+ '...');

console.log('Key type:', supabaseKey.startsWith('eyJ') ? 'JWT Token' : 'Unknown format');


console.log('Environment check:', {
  hasUrl: !!supabaseUrl,
  urlPrefix: supabaseUrl?.substring(0, 20),
  hasKey: !!supabaseKey,
  keyPrefix: supabaseKey?.substring(0, 10),
  nodeEnv: process.env.NODE_ENV
});
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

// app.get('/api/test-connection1', async (_req: express.Request, res: express.Response) => {
//   try {
//     const { data, error } = await supabase
//       .from('Bhajan_Signups')
//       .select('offeringStatus')
//       .limit(1);

//     if (error) {
//       throw error;
//     }

//     res.json({
//       status: 'success',
//       connected: !!data
//     });
//   } catch (error) {
//     const pgError = error as PostgrestError;
//     res.status(500).json({
//       error: 'Failed to connect to database',
//       details: pgError.message
//     });
//   }
// });

app.get('/api/test-connection', async (_req: express.Request, res: express.Response) => {
  try {
    console.log('Testing database connection...');

    // Try a direct select with no filters first
    console.log('Attempting direct select...');
    const { data: selectData, error: selectError } = await supabase
      .from('Bhajan_Signups')
      .select('*')
      .limit(5);

    if (selectError) {
      console.error('Select error:', selectError);
      const error = selectError as PostgrestError;
      throw new Error(error.message);
    }

    console.log('Select successful!');
    console.log('Rows retrieved:', selectData?.length);
    if (selectData && selectData.length > 0) {
      console.log('First row:', selectData[0]);
      console.log('Available columns:', Object.keys(selectData[0]));
    }

    // Try another test with offering status filter
    console.log('\nTesting with offeringStatus filter...');
    const { data: filterData, error: filterError } = await supabase
      .from('Bhajan_Signups')
      .select('offeringStatus');

    if (filterError) {
      console.error('Filter error:', filterError);
    } else if (filterData) {
      const statuses = [...new Set(filterData.map(row => row.offeringStatus))].filter(Boolean);
      console.log('Available offeringStatus values:', statuses);
    }

    res.json({
      status: 'success',
      selectResult: {
        rowCount: selectData?.length || 0,
        firstRow: selectData?.[0],
        error: selectError ? (selectError as PostgrestError).message : null
      },
      filterResult: {
        availableStatuses: filterData ?
          [...new Set(filterData.map(row => row.offeringStatus))].filter(Boolean) :
          [],
        error: filterError ? (filterError as PostgrestError).message : null
      }
    });
  } catch (error) {
    console.error('Error testing connection:', error);
    const pgError = error as PostgrestError;
    res.status(500).json({
      error: 'Failed to connect to database',
      details: pgError.message || 'Unknown error',
      code: pgError.code,
      hint: "Please verify your SUPABASE_SERVICE_KEY is the 'service_role' key, not the 'anon' key"
    });
  }
});

// Deity distribution endpoint

app.get('/api/bhajan-signups/deity-distribution', async (req: any, res: any) => {
  try {
    console.log('Fetching deity distribution...');

    const offering_on = req.query.offering_on as string;
    console.log('Filtering by offering_on:', offering_on);

    // Validate date format if provided
    if (offering_on && !/^\d{4}-\d{2}-\d{2}$/.test(offering_on)) {
      return res.status(400).json({
        error: 'Invalid date format. Use YYYY-MM-DD'
      });
    }

    // Build query
    let query = supabase
      .from('Bhajan_Signups')
      .select('diety, signedUp, offering_on');

    // Apply date filter if provided
    if (offering_on) {
      // Convert the date string to timestamp range for that day
      const startTime = `${offering_on}T00:00:00`;
      const endTime = `${offering_on}T23:59:59`;

      console.log('Filtering offering_on between:', startTime, 'and', endTime);

      query = query
        .gte('offering_on', startTime)
        .lte('offering_on', endTime);
    }

    const { data, error } = await query;

    if (error) {
      throw error;
    }

    // Initialize distribution with all deities set to 0
    const distribution: DietyDistribution[] = VALID_DIETIES.map(diety => ({
      diety,
      icon: DIETY_ICONS[diety] || '🙏',
      count: 0
    }));

    // Count signed up entries for each deity
    data?.forEach(row => {
      if (row.signedUp) {
        const index = distribution.findIndex(d => d.diety === row.diety);
        if (index !== -1) {
          distribution[index].count++;
        }
      }
    });

    console.log('Distribution calculated:', {
      date: offering_on || 'all dates',
      distribution
    });

    res.json({
      status: 'success',
      data: distribution,
      filters: {
        offering_on: offering_on || null
      }
    });

  } catch (error) {
    console.error('Error fetching deity distribution:', error);
    const pgError = error as PostgrestError;
    res.status(500).json({
      error: 'Failed to fetch deity distribution',
      details: pgError.message
    });
  }
});

// Tempo distribution endpoint
app.get('/api/bhajan-signups/tempo-distribution', async (req: any, res: any) => {
  try {
    console.log('Fetching tempo distribution...');

    const offering_on = req.query.offering_on as string;
    console.log('Filtering by offering_on:', offering_on);

    // Validate date format if provided
    if (offering_on && !/^\d{4}-\d{2}-\d{2}$/.test(offering_on)) {
      return res.status(400).json({
        error: 'Invalid date format. Use YYYY-MM-DD'
      });
    }

    // Build query
    let query = supabase
      .from('Bhajan_Signups')
      .select('tempo, signedUp, offering_on');

    // Apply date filter if provided
    // Apply date filter if provided
    if (offering_on) {
      // Convert the date string to timestamp range for that day
      const startTime = `${offering_on}T00:00:00`;
      const endTime = `${offering_on}T23:59:59`;

      console.log('Filtering offering_on between:', startTime, 'and', endTime);

      query = query
        .gte('offering_on', startTime)
        .lte('offering_on', endTime);
    }

    const { data, error } = await query;

    if (error) {
      throw error;
    }

    // Initialize distribution with all tempos set to 0
    const distribution: TempoDistribution[] = VALID_TEMPOS.map(tempo => ({
      tempo,
      icon: TEMPO_ICONS[tempo] ||  "🐢",
      count: 0
    }));

    // Count signed up entries for each tempo
    data?.forEach(row => {
      if (row.signedUp) {
        const index = distribution.findIndex(t => t.tempo === row.tempo);
        if (index !== -1) {
          distribution[index].count++;
        }
      }
    });

    console.log('Tempo distribution calculated:', {
      date: offering_on || 'all dates',
      distribution
    });

    res.json({
      status: 'success',
      data: distribution,
      filters: {
        offering_on: offering_on || null
      }
    });

  } catch (error) {
    console.error('Error fetching tempo distribution:', error);
    const pgError = error as PostgrestError;
    res.status(500).json({
      error: 'Failed to fetch tempo distribution',
      details: pgError.message
    });
  }
});

app.post('/api/bhajans', async (req: express.Request, res: express.Response) => {
  try {
    const { filters, pagination } = req.body as GetBhajansRequest;
    
    let query = supabase
      .from(VALID_LABELS.bhajan_db)
      .select('*', { count: 'exact' });

    if (filters) {
      if (filters.Deity) {
        query = query.eq('Deity', filters.Deity);
      }
      if (filters.Tempo) {
        query = query.eq('Tempo', filters.Tempo);
      }
      if (filters.Title) {
        query = query.ilike('Title', `${filters.Title}%`);
      }
    }

    if (pagination) {
      const { page, pageSize } = pagination;
      const start = (page - 1) * pageSize;
      query = query.range(start, start + pageSize - 1);
    }

    const { data, error, count } = await query;

    if (error) throw error;

    const formattedData: FormattedBhajan[] = data?.map(item => ({
      id: item.id,
      Title: item.Title,
      Lyrics: item.Lyrics,
      Meaning: item.Meaning,
      Diety: item.Deity ? {
        value: item.Deity,
        icon: DIETY_ICONS[item.Deity] || null
      } : undefined,
      Tempo: item.Tempo ? {
        value: item.Tempo,
        icon: TEMPO_ICONS[item.Tempo] || null
      } : undefined,
      Language: item.Language,
      Level: item.Level,
      Raga: item.Raga,
      Beat: item.Beat,
      Gents_Pitch: item.Gents_Pitch,
      Ladies_Pitch: item.Ladies_Pitch,
      Links: {
        SaiRhythms: item.SaiRhythms_Link || undefined,
        Audio: item.AudioLink || undefined
      }
    })) || [];

    res.json({
      data: formattedData,
      total: count || 0,
      page: pagination?.page || 1,
      pageSize: pagination?.pageSize || data?.length || 0
    });

  } catch (error) {
    console.error('Error fetching bhajans:', error);
    const pgError = error as PostgrestError;
    res.status(500).json({
      error: 'Failed to fetch bhajans',
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

    // Transform the data to include formatted tempo and deity fields
    const formattedData: FormattedBhajanSignup[] = data?.map(item => ({
      ...item,
      tempo: {
        value: item.tempo,
        icon: TEMPO_ICONS[item.tempo] || '⏱️'
      },
      diety: {
        value: item.diety,
        icon: DIETY_ICONS[item.diety] || '🙏'
      }
    })) || [];

    const endTime = performance.now();
    const queryTime = endTime - startTime;

    console.log('Query completed successfully');
    console.log('Results:', {
      count: data?.length || 0,
      executionTime: `${queryTime.toFixed(2)}ms`
    });

    res.json({
      data : formattedData,
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


// const createBhajanSignup: RequestHandler = async (req: express.Request, res: express.Response) => {
//   try {
//     const startTime = performance.now();
//     const newSignup: CreateBhajanSignupRequest = req.body;

//     console.log('Processing create request:', JSON.stringify(newSignup, null, 2));

//     // Insert new record
//     const { data, error } = await supabase
//       .from('Bhajan_Signups')
//       .insert([
//         {
//           singer: newSignup.singer,
//           song: newSignup.song,
//           diety: newSignup.diety,
//           tempo: newSignup.tempo,
//           duration: newSignup.duration,
//           date: newSignup.date,
//           notes: newSignup.notes || null
//         }
//       ])
//       .select()
//       .single();

//     if (error) {
//       throw error;
//     }

//     // Format the response data similar to your get endpoint
//     const formattedData: FormattedBhajanSignup = {
//       ...data,
//       tempo: {
//         value: data.tempo,
//         icon: TEMPO_ICONS[data.tempo] || '⏱️'
//       },
//       diety: {
//         value: data.diety,
//         icon: DIETY_ICONS[data.diety] || '🙏'
//       }
//     };

//     const endTime = performance.now();
//     const executionTime = endTime - startTime;

//     console.log('Create operation completed successfully');
//     console.log('Results:', {
//       id: data.id,
//       executionTime: `${executionTime.toFixed(2)}ms`
//     });

//     res.status(201).json({
//       data: formattedData,
//       debug: {
//         executionTime: `${executionTime.toFixed(2)}ms`,
//         operation: 'create',
//         timestamp: new Date().toISOString()
//       }
//     });

//   } catch (error) {
//     console.error('Error in /api/bhajan-signup/create:', error);
//     const pgError = error as PostgrestError;
    
//     // Handle unique constraint violations
//     if (pgError.code === '23505') {
//       res.status(409).json({
//         error: 'Duplicate entry',
//         details: 'A signup with these details already exists'
//       });
//       return;
//     }

//     res.status(500).json({
//       error: 'Failed to create Bhajan signup',
//       details: pgError.message
//     });
//   }
// };

// Register the route with both middleware and handler
app.post('/api/bhajan-signup/create', validateCreateRequest, async (req: express.Request, res: express.Response) => {
  try {
    const startTime = performance.now();
    const newSignup: CreateBhajanSignupRequest = req.body;

    console.log('Processing create request:', JSON.stringify(newSignup, null, 2));

    // Insert new record
    const { data, error } = await supabase
      .from('Bhajan_Signups')
      .insert([
        {
          title: newSignup.title,
          position: newSignup.position,
          singer: newSignup.singer,
          details: newSignup.details,
          tempo: newSignup.tempo?.value,
          diety: newSignup.diety?.value,
          dietyIcon : newSignup.diety?.icon,
          tempoIcon : newSignup.tempo?.icon,
          offering_on: newSignup.offering_on,
          offeringStatus: newSignup.offeringStatus,
          signedUp: true
        }
      ])
      .select()
      .single();

    if (error) {
      throw error;
    }

    // Format the response data similar to your get endpoint
    const formattedData: FormattedBhajanSignup = {
      ...data,
      tempo: {
        value: data.tempo,
        icon: TEMPO_ICONS[data.tempo] || '⏱️'
      },
      diety: {
        value: data.diety,
        icon: DIETY_ICONS[data.diety] || '🙏'
      }
    };

    const endTime = performance.now();
    const executionTime = endTime - startTime;

    console.log('Create operation completed successfully');
    console.log('Results:', {
      id: data.id,
      executionTime: `${executionTime.toFixed(2)}ms`
    });

    res.status(201).json({
      data: formattedData,
      debug: {
        executionTime: `${executionTime.toFixed(2)}ms`,
        operation: 'create',
        timestamp: new Date().toISOString()
      }
    });

  } catch (error) {
    console.error('Error in /api/bhajan-signup/create:', error);
    const pgError = error as PostgrestError;
    
    // Handle unique constraint violations
    if (pgError.code === '23505') {
      res.status(409).json({
        error: 'Duplicate entry',
        details: 'A signup with these details already exists'
      });
      return;
    }

    res.status(500).json({
      error: 'Failed to create Bhajan signup',
      details: pgError.message
    });
  }
});
// Start server
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
