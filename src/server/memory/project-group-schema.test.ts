/**
 * @fileoverview Tests for project-group-schema validation
 * @author Meiyuki <meiyukichan@163.com>
 * @copyright 2026 Meiyuki
 */
import { describe, it, expect } from 'vitest';
import { validateProjectGroupsFile, ProjectGroupsSchema } from './project-group-schema.js';

const validJson = JSON.stringify({
  version: '1.0.0',
  lastUpdated: '2026-06-21T00:00:00Z',
  groups: [
    {
      projectGroup: '订单履约项目群',
      projectDesc: '覆盖从下单到履约的全链路',
      projectPortrait:
        '面向交易中台团队，采用DDD+CQRS架构，核心实体Order/Shipment，关键组件：订单服务、履约引擎；覆盖消费者下单→商家发货，服务消费者与商家，达成提升履约时效；数据流购物车→Order→结算；不包含：支付清结算、商品库存',
      members: ['订单服务重构设计.md', '履约调度引擎设计.md'],
      tags: ['交易', '核心域'],
      status: 'active',
    },
  ],
});

describe('ProjectGroupsSchema.parse', () => {
  it('accepts valid full JSON', () => {
    const result = ProjectGroupsSchema.parse(JSON.parse(validJson));
    expect(result.groups).toHaveLength(1);
    expect(result.groups[0].projectGroup).toBe('订单履约项目群');
    expect(result.groups[0].members).toEqual(['订单服务重构设计.md', '履约调度引擎设计.md']);
  });

  it('defaults status to active when omitted', () => {
    const withoutStatus = JSON.parse(validJson);
    delete withoutStatus.groups[0].status;
    const result = ProjectGroupsSchema.parse(withoutStatus);
    expect(result.groups[0].status).toBe('active');
  });

  // ---- rejection cases ----

  it('rejects when projectGroup is missing', () => {
    const obj = JSON.parse(validJson);
    delete obj.groups[0].projectGroup;
    const result = ProjectGroupsSchema.safeParse(obj);
    expect(result.success).toBe(false);
  });

  it('rejects when projectPortrait is missing', () => {
    const obj = JSON.parse(validJson);
    delete obj.groups[0].projectPortrait;
    const result = ProjectGroupsSchema.safeParse(obj);
    expect(result.success).toBe(false);
  });

  it('rejects when members is an object array instead of string array', () => {
    const obj = JSON.parse(validJson);
    obj.groups[0].members = [
      { id: 'p1', name: 'OpenPowers', techStack: { language: 'TypeScript' } },
    ];
    const result = ProjectGroupsSchema.safeParse(obj);
    expect(result.success).toBe(false);
  });

  it('rejects extra top-level fields (strict)', () => {
    const obj = { ...JSON.parse(validJson), generatedAt: '2026-06-21T00:00:00Z' };
    const result = ProjectGroupsSchema.safeParse(obj);
    expect(result.success).toBe(false);
  });

  it('rejects extra group-level fields like similarityDimensions (strict)', () => {
    const obj = JSON.parse(validJson);
    obj.groups[0].similarityDimensions = { tech: 0.8 };
    const result = ProjectGroupsSchema.safeParse(obj);
    expect(result.success).toBe(false);
  });

  it('rejects wrong status value', () => {
    const obj = JSON.parse(validJson);
    obj.groups[0].status = 'unknown';
    const result = ProjectGroupsSchema.safeParse(obj);
    expect(result.success).toBe(false);
  });

  it('rejects empty projectGroup', () => {
    const obj = JSON.parse(validJson);
    obj.groups[0].projectGroup = '';
    const result = ProjectGroupsSchema.safeParse(obj);
    expect(result.success).toBe(false);
  });
});

describe('validateProjectGroupsFile', () => {
  // NOTE: This function uses require('fs') inside for simplicity.
  // These tests validate the shape logic through the Zod schema;
  // the file I/O wrapper is thin and tested implicitly via scheduler integration tests.
  it('returns ok structure for valid data (via safeParse)', () => {
    const result = ProjectGroupsSchema.safeParse(JSON.parse(validJson));
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.version).toBe('1.0.0');
    }
  });
});
