import React, { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Loader2, CheckCircle2, AlertCircle } from 'lucide-react';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import trendsLogo from '@/assets/trends-logo.png';

const schema = z.object({
  full_name: z.string().min(2, 'Please enter your full name'),
  phone: z
    .string()
    .min(10, 'Enter a valid phone number')
    .regex(/^[+\d\s\-()]+$/, 'Enter a valid phone number'),
  acceptTerms: z.boolean().refine((v) => v === true, {
    message: 'You must accept the Terms & Conditions to continue',
  }),
});

type FormValues = z.infer<typeof schema>;

type PageState = 'form' | 'submitting' | 'success' | 'error';

const TNC_TEXT = `By using Trends Virtual Try-On, you agree that your photo will be processed solely to generate your virtual outfit look. Your images are stored securely and are not shared with third parties. Data is retained for a maximum of 24 hours after your session.`;

const Register: React.FC = () => {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token');
  const [pageState, setPageState] = useState<PageState>('form');
  const [errorMessage, setErrorMessage] = useState<string>('');

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      full_name: '',
      phone: '',
      acceptTerms: false,
    },
  });

  const onSubmit = async (values: FormValues) => {
    if (!token) {
      setErrorMessage('Invalid or missing session token. Please scan the QR code again.');
      setPageState('error');
      return;
    }

    setPageState('submitting');

    try {
      const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
      const url = `https://${projectId}.supabase.co/functions/v1/update-session`;

      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionToken: token,
          updates: {
            full_name: values.full_name,
            phone: values.phone,
            registration_status: 'registered',
          },
        }),
      });

      const data = await res.json();

      if (!res.ok || data.error) {
        throw new Error(data.error || 'Failed to register');
      }

      setPageState('success');
    } catch (err) {
      console.error('Registration error:', err);
      const msg = err instanceof Error ? err.message : 'Something went wrong';
      if (msg.includes('expired') || msg.includes('Invalid session')) {
        setErrorMessage('This session has expired. Please ask the store associate to generate a new QR code.');
      } else {
        setErrorMessage('Could not complete registration. Please try again or ask a store associate for help.');
      }
      setPageState('error');
    }
  };

  if (!token) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-6">
        <div className="max-w-sm w-full text-center space-y-4">
          <AlertCircle className="w-12 h-12 text-destructive mx-auto" />
          <h1 className="text-xl font-semibold text-foreground">Invalid Link</h1>
          <p className="text-muted-foreground text-sm">
            This link is missing a session token. Please scan the QR code on the kiosk again.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-start pt-10 px-5 pb-10">
      {/* Logo */}
      <div className="mb-8">
        <img src={trendsLogo} alt="Trends" className="h-9 object-contain" />
      </div>

      {pageState === 'success' ? (
        /* Success screen */
        <div className="w-full max-w-sm text-center space-y-5 animate-fade-in mt-10">
          <div className="w-20 h-20 rounded-full bg-primary/10 flex items-center justify-center mx-auto">
            <CheckCircle2 className="w-10 h-10 text-primary" />
          </div>
          <h1 className="text-2xl font-display font-semibold text-foreground">You're all set!</h1>
          <p className="text-muted-foreground leading-relaxed">
            Head back to the kiosk — your try-on experience is starting now.
          </p>
          <div className="pt-2 text-sm text-muted-foreground/60">
            You can close this tab.
          </div>
        </div>
      ) : pageState === 'error' ? (
        /* Error screen */
        <div className="w-full max-w-sm text-center space-y-5 animate-fade-in mt-10">
          <div className="w-20 h-20 rounded-full bg-destructive/10 flex items-center justify-center mx-auto">
            <AlertCircle className="w-10 h-10 text-destructive" />
          </div>
          <h1 className="text-2xl font-display font-semibold text-foreground">Something went wrong</h1>
          <p className="text-muted-foreground text-sm leading-relaxed">{errorMessage}</p>
          <button
            onClick={() => setPageState('form')}
            className="text-sm text-primary underline underline-offset-4"
          >
            Try again
          </button>
        </div>
      ) : (
        /* Registration form */
        <div className="w-full max-w-sm space-y-6 animate-fade-in">
          <div className="text-center space-y-1">
            <h1 className="text-2xl font-display font-semibold text-foreground">
              Register for Your Try-On
            </h1>
            <p className="text-muted-foreground text-sm">
              Enter your details to get started on the kiosk
            </p>
          </div>

          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">
              {/* Full Name */}
              <FormField
                control={form.control}
                name="full_name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Full Name</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="e.g. Priya Sharma"
                        autoComplete="name"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Phone */}
              <FormField
                control={form.control}
                name="phone"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Phone Number</FormLabel>
                    <FormControl>
                      <Input
                        type="tel"
                        placeholder="e.g. 9876543210"
                        autoComplete="tel"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* T&C */}
              <FormField
                control={form.control}
                name="acceptTerms"
                render={({ field }) => (
                  <FormItem className="rounded-lg border border-border p-4 space-y-3">
                    <div className="text-xs text-muted-foreground leading-relaxed max-h-24 overflow-y-auto pr-1">
                      {TNC_TEXT}
                    </div>
                    <div className="flex items-start gap-3">
                      <FormControl>
                        <Checkbox
                          checked={field.value}
                          onCheckedChange={field.onChange}
                          id="acceptTerms"
                        />
                      </FormControl>
                      <label
                        htmlFor="acceptTerms"
                        className="text-sm text-foreground leading-snug cursor-pointer select-none"
                      >
                        I accept the Terms &amp; Conditions
                      </label>
                    </div>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Submit */}
              <button
                type="submit"
                disabled={pageState === 'submitting'}
                className="btn-primary-vto w-full py-4 text-base flex items-center justify-center gap-2 disabled:opacity-70"
              >
                {pageState === 'submitting' ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    Registering…
                  </>
                ) : (
                  'Start My Try-On'
                )}
              </button>
            </form>
          </Form>
        </div>
      )}
    </div>
  );
};

export default Register;
