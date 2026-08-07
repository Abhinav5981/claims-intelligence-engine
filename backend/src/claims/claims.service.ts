import { BadGatewayException, BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Assessment } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { OpenAiService } from '../openai/openai.service';
import { AssessClaimDto } from './dto/assess-claim.dto';

interface ResolvedInput {
  claimId: string | null;
  evidenceId: string | null;
  claimText: string;
  evidenceText: string;
}

@Injectable()
export class ClaimsService {
  private readonly logger = new Logger(ClaimsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly openAi: OpenAiService,
  ) {}

  async assessClaim(dto: AssessClaimDto): Promise<Assessment> {
    const input = await this.resolveInput(dto);

    let result;
    try {
      result = await this.openAi.evaluateClaim(input.claimText, input.evidenceText);
    } catch (err) {
      this.logger.error('OpenAI evaluation failed', err instanceof Error ? err.stack : err);

      // Persist the failed attempt too — visibility into LLM failures matters as much as
      // successes for an audit trail, and it lets the UI show "retry" instead of losing context.
      await this.prisma.assessment.create({
        data: {
          claimId: input.claimId,
          evidenceId: input.evidenceId,
          claimTextSnapshot: input.claimText,
          evidenceTextSnapshot: input.evidenceText,
          justified: false,
          confidenceScore: 0,
          reasoning: 'Assessment failed: the LLM call did not complete successfully.',
          modelUsed: 'unknown',
          status: 'FAILED',
        },
      });

      throw new BadGatewayException('Claim assessment failed while contacting the evaluation model. Please retry.');
    }

    const assessment = await this.prisma.assessment.create({
      data: {
        claimId: input.claimId,
        evidenceId: input.evidenceId,
        claimTextSnapshot: input.claimText,
        evidenceTextSnapshot: input.evidenceText,
        justified: result.justified,
        confidenceScore: result.confidenceScore,
        reasoning: result.reasoning,
        modelUsed: result.model,
        rawResponse: result.raw as any,
        status: 'COMPLETED',
      },
    });

    if (input.claimId) {
      await this.prisma.claim.update({
        where: { id: input.claimId },
        data: { status: 'ASSESSED' },
      });
    }

    return assessment;
  }

  private async resolveInput(dto: AssessClaimDto): Promise<ResolvedInput> {
    if (dto.claimId && dto.evidenceId) {
      const [claim, evidence] = await Promise.all([
        this.prisma.claim.findUnique({ where: { id: dto.claimId } }),
        this.prisma.evidence.findUnique({ where: { id: dto.evidenceId } }),
      ]);
      if (!claim) throw new NotFoundException(`Claim ${dto.claimId} not found`);
      if (!evidence) throw new NotFoundException(`Evidence ${dto.evidenceId} not found`);
      if (evidence.claimId !== claim.id) {
        throw new BadRequestException('evidenceId does not belong to claimId');
      }

      return {
        claimId: claim.id,
        evidenceId: evidence.id,
        claimText: claim.text,
        evidenceText: evidence.resultsSummary,
      };
    }

    if (dto.claimText && dto.evidenceText) {
      return {
        claimId: null,
        evidenceId: null,
        claimText: dto.claimText,
        evidenceText: dto.evidenceText,
      };
    }

    throw new BadRequestException(
      'Provide either { claimId, evidenceId } for a submitted claim, or { claimText, evidenceText } for an ad-hoc check.',
    );
  }
}
