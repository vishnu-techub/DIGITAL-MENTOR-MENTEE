import { Request, Response } from 'express';
import { School, Student } from '../../models/index.js';
import { sendSuccess, sendError } from '../../utils/response.js';
import { AuthRequest } from '../../middleware/auth.middleware.js';

/**
 * GET /api/schools
 * Search & filter schools with pagination
 */
export async function getSchools(req: Request, res: Response) {
  try {
    const {
      search,
      city,
      district,
      schoolType,
      isActive,
      page = '1',
      limit = '20',
    } = req.query;

    const pageNum = Math.max(1, parseInt(page as string, 10) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit as string, 10) || 20));
    const skip = (pageNum - 1) * limitNum;

    const query: any = {};

    // Active status filter (default: active only, unless explicitly 'all' or 'false')
    if (isActive === 'false') {
      query.isActive = false;
    } else if (isActive !== 'all') {
      query.isActive = true;
    }

    if (district && typeof district === 'string' && district.trim()) {
      query.district = { $regex: new RegExp(`^${district.trim()}$`, 'i') };
    }

    if (city && typeof city === 'string' && city.trim()) {
      query.city = { $regex: new RegExp(`^${city.trim()}$`, 'i') };
    }

    if (schoolType && typeof schoolType === 'string' && schoolType.trim()) {
      query.schoolType = { $regex: new RegExp(`^${schoolType.trim()}$`, 'i') };
    }

    // Search across schoolName, city, district, displayName, or schoolCode
    if (search && typeof search === 'string' && search.trim()) {
      const term = search.trim();
      const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const searchRegex = new RegExp(escaped, 'i');

      query.$or = [
        { schoolName: searchRegex },
        { displayName: searchRegex },
        { city: searchRegex },
        { district: searchRegex },
        { schoolCode: searchRegex },
        { pincode: searchRegex },
      ];
    }

    const [schools, total] = await Promise.all([
      School.find(query)
        .sort({ schoolName: 1 })
        .skip(skip)
        .limit(limitNum)
        .lean(),
      School.countDocuments(query),
    ]);

    return sendSuccess(res, {
      schools,
      pagination: {
        total,
        page: pageNum,
        limit: limitNum,
        pages: Math.ceil(total / limitNum) || 1,
      },
    }, 'Schools retrieved successfully');
  } catch (err: any) {
    return sendError(res, `Failed to retrieve schools: ${err.message}`, 500);
  }
}

/**
 * GET /api/schools/districts
 * Get distinct districts for filters
 */
export async function getDistricts(_req: Request, res: Response) {
  try {
    const districts = await School.distinct('district');
    districts.sort();
    return sendSuccess(res, districts, 'Districts retrieved successfully');
  } catch (err: any) {
    return sendError(res, `Failed to retrieve districts: ${err.message}`, 500);
  }
}

/**
 * GET /api/schools/stats
 * Statistics for school management
 */
export async function getSchoolStats(_req: Request, res: Response) {
  try {
    const [total, active, inactive, districts] = await Promise.all([
      School.countDocuments({}),
      School.countDocuments({ isActive: true }),
      School.countDocuments({ isActive: false }),
      School.distinct('district'),
    ]);

    return sendSuccess(res, {
      total,
      active,
      inactive,
      districtCount: districts.length,
    }, 'School statistics retrieved successfully');
  } catch (err: any) {
    return sendError(res, `Failed to retrieve school stats: ${err.message}`, 500);
  }
}

/**
 * GET /api/schools/:id
 * Get single school by ID
 */
export async function getSchoolById(req: Request, res: Response) {
  try {
    const { id } = req.params;
    const school = await School.findById(id).lean();
    if (!school) {
      return sendError(res, 'School not found', 404);
    }
    return sendSuccess(res, school, 'School retrieved successfully');
  } catch (err: any) {
    return sendError(res, `Failed to retrieve school: ${err.message}`, 500);
  }
}

/**
 * POST /api/schools
 * Create school (Admin)
 */
export async function createSchool(req: AuthRequest, res: Response) {
  try {
    const { schoolName, city, district, state, schoolType, schoolCode, pincode } = req.body;

    if (!schoolName?.trim() || !city?.trim() || !district?.trim()) {
      return sendError(res, 'School name, city, and district are required.', 400);
    }

    const cleanName = schoolName.trim();
    const cleanCity = city.trim();
    const cleanDistrict = district.trim();
    const displayName = `${cleanName} — ${cleanCity}, ${cleanDistrict}`;

    // Check duplicate
    const existing = await School.findOne({
      schoolName: { $regex: new RegExp(`^${cleanName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') },
      city: { $regex: new RegExp(`^${cleanCity.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') },
      district: { $regex: new RegExp(`^${cleanDistrict.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') },
    });

    if (existing) {
      return sendError(res, 'A school with this name, city, and district already exists.', 409);
    }

    const school = await School.create({
      schoolName: cleanName,
      city: cleanCity,
      district: cleanDistrict,
      state: state?.trim() || 'Tamil Nadu',
      schoolType: schoolType?.trim() || 'Other',
      schoolCode: schoolCode?.trim() || undefined,
      pincode: pincode?.trim() || undefined,
      displayName,
      isActive: true,
    });

    return sendSuccess(res, school, 'School created successfully', 201);
  } catch (err: any) {
    return sendError(res, `Failed to create school: ${err.message}`, 500);
  }
}

/**
 * PUT /api/schools/:id
 * Update school (Admin)
 */
export async function updateSchool(req: AuthRequest, res: Response) {
  try {
    const { id } = req.params;
    const { schoolName, city, district, state, schoolType, schoolCode, pincode, isActive } = req.body;

    const school = await School.findById(id);
    if (!school) {
      return sendError(res, 'School not found', 404);
    }

    if (schoolName) school.schoolName = schoolName.trim();
    if (city) school.city = city.trim();
    if (district) school.district = district.trim();
    if (state) school.state = state.trim();
    if (schoolType) school.schoolType = schoolType.trim();
    if (schoolCode !== undefined) school.schoolCode = schoolCode ? schoolCode.trim() : undefined;
    if (pincode !== undefined) school.pincode = pincode ? pincode.trim() : undefined;
    if (isActive !== undefined) school.isActive = Boolean(isActive);

    school.displayName = `${school.schoolName} — ${school.city}, ${school.district}`;

    await school.save();

    return sendSuccess(res, school, 'School updated successfully');
  } catch (err: any) {
    return sendError(res, `Failed to update school: ${err.message}`, 500);
  }
}

/**
 * PATCH /api/schools/:id/toggle
 * Toggle active status (Admin)
 */
export async function toggleSchoolStatus(req: AuthRequest, res: Response) {
  try {
    const { id } = req.params;
    const school = await School.findById(id);
    if (!school) {
      return sendError(res, 'School not found', 404);
    }

    school.isActive = !school.isActive;
    await school.save();

    return sendSuccess(
      res,
      school,
      `School ${school.isActive ? 'activated' : 'disabled'} successfully`
    );
  } catch (err: any) {
    return sendError(res, `Failed to toggle school status: ${err.message}`, 500);
  }
}

/**
 * DELETE /api/schools/:id
 * Delete or disable school if referenced by students (Admin)
 */
export async function deleteSchool(req: AuthRequest, res: Response) {
  try {
    const { id } = req.params;
    const school = await School.findById(id);
    if (!school) {
      return sendError(res, 'School not found', 404);
    }

    // Check if any student references this school
    const isReferenced = await Student.exists({
      $or: [
        { 'school.tenthSchoolId': id },
        { 'school.twelfthSchoolId': id },
      ],
    });

    if (isReferenced) {
      // Do NOT delete if referenced. Instead mark isActive = false
      school.isActive = false;
      await school.save();
      return sendSuccess(
        res,
        school,
        'School is referenced by student profiles. It has been deactivated instead of permanently deleted.'
      );
    }

    await School.findByIdAndDelete(id);
    return sendSuccess(res, { id: id as string }, 'School deleted successfully');
  } catch (err: any) {
    return sendError(res, `Failed to delete school: ${err.message}`, 500);
  }
}
