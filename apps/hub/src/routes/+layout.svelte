<script>
  import '../app.css';

  let { children } = $props();
</script>

<div class="min-h-screen bg-white text-gray-900">
  <main>
    {@render children()}
  </main>
</div>
