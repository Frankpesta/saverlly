import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsIn, IsUUID, ValidateIf } from 'class-validator';
import { RECIPE_PROBLEMS, type RecipeProblem } from '@saverlly/shared-types';

export class RecipeHealthReportDto {
  @ApiProperty() @IsUUID() merchantId: string;

  @ApiProperty({ description: "Whether the store's recipe found its checkout" })
  @IsBoolean()
  ok: boolean;

  @ApiPropertyOptional({
    enum: RECIPE_PROBLEMS,
    description: 'Required when ok is false',
  })
  @ValidateIf((report: RecipeHealthReportDto) => report.ok === false)
  @IsIn(RECIPE_PROBLEMS)
  problem?: RecipeProblem;
}
