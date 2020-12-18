import { Router } from '@angular/router';
import { Injector, OnInit } from '@angular/core';

import { map, switchMap, tap} from 'rxjs/operators';

import { RemoteData } from '../../core/data/remote-data';
import { DataService } from '../../core/data/data.service';
import { DSpaceObject } from '../../core/shared/dspace-object.model';
import { ResourceType } from '../../core/shared/resource-type';
import { NotificationOptions } from '../notifications/models/notification-options.model';
import { NotificationsService } from '../notifications/notifications.service';
import { TranslateService } from '@ngx-translate/core';
import { RequestService } from '../../core/data/request.service';
import { SearchService } from '../../core/shared/search/search.service';
import { Observable} from 'rxjs/internal/Observable';
import { of} from 'rxjs/internal/observable/of';
import { ProcessTaskResponse } from '../../core/tasks/models/process-task-response';
import { getFirstSucceededRemoteDataPayload } from '../../core/shared/operators';
import { getSearchResultFor } from '../search/search-result-element-decorator';
import { MyDSpaceActionsComponent } from './mydspace-actions';

/**
 * Abstract class for all different representations of mydspace actions
 */
export abstract class MyDSpaceReloadableActionsComponent<T extends DSpaceObject, TService extends DataService<T>>
  extends MyDSpaceActionsComponent<T, TService> implements OnInit {

  protected constructor(
    protected objectType: ResourceType,
    protected injector: Injector,
    protected router: Router,
    protected notificationsService: NotificationsService,
    protected translate: TranslateService,
    protected searchService: SearchService,
    protected requestService: RequestService) {
    super(objectType, injector, router, notificationsService, translate, searchService, requestService);
  }

  /**
   * Perform the actual implementation of this reloadable action.
   */
  abstract actionExecution(): Observable<ProcessTaskResponse>;

  /**
   * Reload the object (typically by a remote call).
   */
  abstract reloadObjectExecution(): Observable<RemoteData<DSpaceObject> | DSpaceObject>;

  ngOnInit() {
    this.initReloadAnchor();
    this.initObjects(this.object);
  }

  /**
   * Start the execution of the action.
   * 1. performAction
   * 2. reload of the object
   * 3. notification
   */
  startActionExecution(): Observable<DSpaceObject> {
    this.processing$.next(true);
    return this.actionExecution().pipe(
      switchMap((res: ProcessTaskResponse) => {
        if (res.hasSucceeded) {
          return this._reloadObject().pipe(
            tap(
              (reloadedObject) => {
                this.processing$.next(false);
                this.handleReloadableActionResponse(res.hasSucceeded, reloadedObject);
                return reloadedObject;
              })
          )
        } else {
          this.processing$.next(false);
          this.handleReloadableActionResponse(res.hasSucceeded, null);
          return of(null);
        }
      }));
  }

  /**
   * Handle the action response and show properly notifications.
   *
   * @param result
   *    true on success, false otherwise
   * @param reloadedObject
   *    the reloadedObject
   */
  handleReloadableActionResponse(result: boolean, reloadedObject: DSpaceObject): void {
    if (result) {
      if (reloadedObject) {
        this.processCompleted.emit({result, reloadedObject});
      } else {
        this.reload();
      }
      this.notificationsService.success(null,
        this.translate.get('submission.workflow.tasks.generic.success'),
        new NotificationOptions(5000, false));
    } else {
      this.notificationsService.error(null,
        this.translate.get('submission.workflow.tasks.generic.error'),
        new NotificationOptions(20000, true));
    }
  }

  /**
   * Hook called on init to initialized the required information used to reload the object.
   */
  // tslint:disable-next-line:no-empty
  initReloadAnchor() {}

  /**
   * Convert the reloadedObject to the Type required by this action.
   * @param dso
   */
  convertReloadedObject(dso: DSpaceObject): DSpaceObject {
    const constructor = getSearchResultFor((dso as any).constructor);
    const reloadedObject = Object.assign(new constructor(), dso, {
      indexableObject: dso
    });
    return reloadedObject;
  }

  /**
   * Retrieve the refreshed object and transform it to a reloadedObject.
   * @param dso
   */
  private _reloadObject(): Observable<DSpaceObject> {
    return this.reloadObjectExecution().pipe(
      switchMap((res) => {
        return res instanceof RemoteData ? of(res).pipe(getFirstSucceededRemoteDataPayload()) : of(res)
      })).pipe(map((dso) => {
      return this.convertReloadedObject(dso);
    }))
  }

}
