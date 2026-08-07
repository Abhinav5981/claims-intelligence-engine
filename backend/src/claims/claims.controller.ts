import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { Assessment } from '@prisma/client';
import { ClaimsService } from './claims.service';
import { AssessClaimDto } from './dto/assess-claim.dto';

@Controller('api/claims')
export class ClaimsController {
  constructor(private readonly claimsService: ClaimsService) {}

  // POST /api/claims/assess
  // Body: { claimId, evidenceId } for a submitted claim, or { claimText, evidenceText } ad-hoc.
  // Returns the persisted Assessment (justified, confidenceScore, reasoning, ...).
  @Post('assess')
  @HttpCode(HttpStatus.OK)
  async assess(@Body() dto: AssessClaimDto): Promise<Assessment> {
    return this.claimsService.assessClaim(dto);
  }
}
