import { IsOptional, IsString, MinLength } from 'class-validator';

// Supports two ways of calling the endpoint:
//  1) claimId + evidenceId — the normal flow, once the Business/Manager/Scientist/Evaluator
//     steps have already produced real Claim and Evidence rows.
//  2) claimText + evidenceText — ad-hoc mode, useful for quick triage or demoing the LLM
//     assessment before the full workflow/records exist.
// Cross-field "at least one pair required" validation is enforced in ClaimsService, where a
// clearer, single BadRequestException can be raised than class-validator's grouped errors allow.
export class AssessClaimDto {
  @IsOptional()
  @IsString()
  claimId?: string;

  @IsOptional()
  @IsString()
  evidenceId?: string;

  @IsOptional()
  @IsString()
  @MinLength(10, { message: 'claimText looks too short to be a real claim' })
  claimText?: string;

  @IsOptional()
  @IsString()
  @MinLength(10, { message: 'evidenceText looks too short to be a real study summary' })
  evidenceText?: string;
}
