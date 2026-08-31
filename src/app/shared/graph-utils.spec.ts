import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { buildCareerGraph } from './graph-utils';
import { History } from '../models';

@Component({ standalone: true, template: 'group' })
class GroupStub {}
@Component({ standalone: true, template: 'not-found' })
class NotFoundStub {}

function history(over: Partial<History> = {}): History {
  return {
    id: 'h1',
    member_id: 'm1',
    group_id: 'g1',
    joined_at: '2020-01-01',
    left_at: null,
    ...over,
  } as History;
}

describe('buildCareerGraph routePath', () => {
  it('builds a group route the router can match (no trailing slash)', async () => {
    const [node] = buildCareerGraph([history()]);
    expect(node.routePath).toBe('/group/g1');

    TestBed.configureTestingModule({
      providers: [
        provideRouter([
          { path: 'group/:id', component: GroupStub },
          { path: '**', component: NotFoundStub },
        ]),
      ],
    });
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl(node.routePath, GroupStub);
    expect(TestBed.inject(Router).url).toBe('/group/g1');
  });

  it('leaves external entries without a route', () => {
    const [node] = buildCareerGraph([
      history({ group_id: null, external_group_name: 'Foo' } as Partial<History>),
    ]);
    expect(node.routePath).toBe('');
  });
});
