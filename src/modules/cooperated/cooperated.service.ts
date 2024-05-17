import { HttpException, HttpStatus, Injectable, UnprocessableEntityException } from "@nestjs/common";
import { CreateCooperatedDto } from "./dto/create-cooperated.dto";
import { InjectRepository } from "@nestjs/typeorm";
import { Cooperated } from "./entities/cooperated.entity";
import { DataSource, DeepPartial, Repository } from "typeorm";
import { IPaginationOptions } from "../../utils/types/pagination-options";
import { EntityCondition } from "../../utils/types/entity-condition.type";
import { NullableType } from "../../utils/types/nullable.type";
import { OrganizationService } from "../organization/organization.service";

@Injectable()
export class CooperatedService {
  constructor(
    @InjectRepository(Cooperated)
    private cooperatedRepository: Repository<Cooperated>,
    private readonly organizationService: OrganizationService,
    private dataSource: DataSource,
  ) {}

  async create(createCooperatedDto: CreateCooperatedDto) {
    if (!createCooperatedDto.document) throw new UnprocessableEntityException("document should not be empty");
    if (!createCooperatedDto.organization) throw new UnprocessableEntityException("organization should not be empty");

    const normalizedDocument = createCooperatedDto.document.replace(/\D/g, "");
    const alreadyOneWithDocument = await this.cooperatedRepository.findOne({
      where: {
        document: normalizedDocument,
      },
    });
    if (alreadyOneWithDocument) throw new UnprocessableEntityException("document already exists");

    const organization = await this.organizationService.findOne({ id: +createCooperatedDto.organization });
    if (!organization) throw new UnprocessableEntityException("organization of provided organization is not found");

    return this.cooperatedRepository.save(this.cooperatedRepository.create({ ...createCooperatedDto, document: normalizedDocument, organization }));
  }

  findManyWithPagination(paginationOptions: IPaginationOptions): Promise<Cooperated[]> {
    return this.cooperatedRepository.find({
      skip: (paginationOptions.page - 1) * paginationOptions.limit,
      take: paginationOptions.limit,
    });
  }

  findOne(fields: EntityCondition<Cooperated>): Promise<NullableType<Cooperated>> {
    return this.cooperatedRepository.findOne({
      where: fields,
    });
  }

  update(id: Cooperated["id"], payload: DeepPartial<Cooperated>): Promise<Cooperated> {
    return this.cooperatedRepository.save(
      this.cooperatedRepository.create({
        id,
        ...payload,
      }),
    );
  }

  async softDelete(id: Cooperated["id"]): Promise<void> {
    await this.cooperatedRepository.softDelete(id);
  }

  async validateDocument(document: string): Promise<{ name?: string; document?: string; email?: string; phone?: string }> {
    const cooperated = await this.cooperatedRepository.findOne({ where: { document: document.replace(/[^0-9]/g, "") } });
    if (!cooperated) {
      throw new HttpException(
        {
          status: HttpStatus.NOT_FOUND,
          errors: "cooperatedNotFound",
        },
        HttpStatus.NOT_FOUND,
      );
    }

    return {
      name: `${cooperated.firstName} ${cooperated.lastName}` || "",
      document: cooperated.document || "",
      email: cooperated.email || "",
      phone: cooperated.phone || "",
    };
  }

  async createBulk(dtos: CreateCooperatedDto[]): Promise<void> {
    const queryRunner = this.dataSource.createQueryRunner();

    await queryRunner.connect();
    await queryRunner.startTransaction();

    const cooperatedEntities = dtos.map(dto => {
      const cooperated = new Cooperated();
      cooperated.email = dto.email;
      cooperated.firstName = dto.firstName;
      cooperated.lastName = dto.lastName;
      cooperated.phone = dto.phone;
      cooperated.document = dto.document;
      cooperated.organization = dto.organization;
      return cooperated;
    });

    try {
      for (const dto of cooperatedEntities) {
        await queryRunner.manager.save(dto);
      }
      await queryRunner.commitTransaction();
    } catch (err) {
      await queryRunner.rollbackTransaction();
    } finally {
      await queryRunner.release();
    }
  }
}
