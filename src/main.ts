import { APP_INITIALIZER } from '@angular/core';
import { provideAnimations } from '@angular/platform-browser/animations';
import { NZ_I18N, en_US } from 'ng-zorro-antd/i18n';
import { NZ_ICONS } from 'ng-zorro-antd/icon';
import {
  ArrowLeftOutline, CheckCircleFill, ClockCircleOutline, EyeOutline, FileOutline, FilePdfOutline, MailFill, PhoneFill, StopOutline, ToolOutline, WarningFill, WhatsAppOutline,
  CheckCircleTwoTone, CloseCircleTwoTone, DeleteOutline, EditOutline, EnvironmentOutline, ExclamationCircleFill, GlobalOutline, HomeOutline, InfoCircleTwoTone, LoadingOutline, MailOutline,
  MobileOutline, PhoneOutline, PlusOutline, TagOutline, UploadOutline, UserOutline
} from '@ant-design/icons-angular/icons';
import { bootstrapApplication } from '@angular/platform-browser';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { provideRouter, withInMemoryScrolling } from '@angular/router';
import { AppComponent } from './app/app.component';
import { routes } from './app/app.routes';
import { authInterceptor } from './app/core/auth.interceptor';
import { MicrosoftAuthService } from './app/core/microsoft-auth.service';

bootstrapApplication(AppComponent, {
  providers: [
    provideRouter(routes, withInMemoryScrolling({ scrollPositionRestoration: 'top' })),
    provideHttpClient(withInterceptors([authInterceptor])),
    // ng-zorro, for the forms that match the admin panel's (Raise a ticket).
    provideAnimations(),
    { provide: NZ_I18N, useValue: en_US },
    {
      provide: NZ_ICONS,
      useValue: [ArrowLeftOutline, CheckCircleFill, ClockCircleOutline, EyeOutline, FileOutline, FilePdfOutline, MailFill, PhoneFill, StopOutline, ToolOutline, WarningFill, WhatsAppOutline,
        CheckCircleTwoTone, CloseCircleTwoTone, DeleteOutline, EditOutline, EnvironmentOutline, ExclamationCircleFill, GlobalOutline, HomeOutline, InfoCircleTwoTone, LoadingOutline, MailOutline,
        MobileOutline, PhoneOutline, PlusOutline, TagOutline, UploadOutline, UserOutline]
    },
    // Read the Microsoft sign-in response before the router can strip it from the URL.
    {
      provide: APP_INITIALIZER,
      useFactory: (microsoftAuth: MicrosoftAuthService) => () => microsoftAuth.handleRedirect(),
      deps: [MicrosoftAuthService],
      multi: true
    }
  ]
}).catch(err => console.error(err));
